#!/usr/bin/env python3
"""Cloud environment controller (adapter-based; mockcloud included).

This script provides deterministic plan/apply/verify workflows for environment
configuration under the repo-env-contract SSOT model.

It is intentionally conservative:
  - Never prints secret values.
  - Applies config only with an explicit `--approve` flag.
  - Treats IAM/Identity changes as out-of-scope for automatic apply.

Supported providers:
  - mockcloud: uses local filesystem state for offline tests/demos.
  - envfile: writes env-file to local or remote targets (legacy aliases: ecs-envfile, ssh).

Exit codes:
  - 0: success
  - 1: failure
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import posixpath
import random
import re
import shutil
import shlex
import stat
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple
from urllib.request import Request, urlopen

import yaml_min

ALLOWED_TYPES = {"string", "int", "float", "bool", "json", "enum", "url"}
LIFECYCLE_STATES = {"active", "deprecated", "removed"}
_DATE_YYYY_MM_DD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ENV_VAR_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_yaml(path: Path) -> Any:
    return yaml_min.safe_load(path.read_text(encoding="utf-8"))


def ensure_ssot_mode(root: Path) -> None:
    gate = root / "docs" / "project" / "env-ssot.json"
    if not gate.exists():
        die(f"Missing SSOT gate file: {gate}")
    data = load_json(gate)
    mode = None
    if isinstance(data, dict):
        mode = data.get("mode") or data.get("env_ssot")
    if mode != "repo-env-contract":
        die(f"SSOT mode must be 'repo-env-contract', got: {mode!r}")


AUTH_MODES = {"role-only", "auto", "ak-only"}
PREFLIGHT_MODES = {"fail", "warn", "off"}


@dataclass(frozen=True)
class PolicyDecision:
    env: str
    runtime_target: str
    workload: Optional[str]
    auth_mode: str
    preflight_mode: str
    rule_id: Optional[str]
    fallback_dir: str
    ak_fallback_record: bool


def load_policy_doc(root: Path) -> Dict[str, Any]:
    policy_path = root / "docs" / "project" / "policy.yaml"
    if not policy_path.exists():
        die(f"Missing policy file: {policy_path} (run env-contractctl init to scaffold)")
    try:
        doc = load_yaml(policy_path)
    except Exception as e:  # noqa: BLE001
        die(f"Failed to parse policy YAML {policy_path}: {e}")
    if not isinstance(doc, dict):
        die(f"Policy file {policy_path} must be a YAML mapping")
    return doc


def get_policy_env(doc: Mapping[str, Any]) -> Dict[str, Any]:
    version = doc.get("version")
    if version not in (1, "1"):
        die(f"Unsupported policy version: {version!r} (expected 1)")
    policy = doc.get("policy")
    if not isinstance(policy, dict):
        die("Policy file must contain top-level mapping: policy: {...}")
    env = policy.get("env")
    if not isinstance(env, dict):
        die("Policy file must contain mapping: policy.env")
    return env


def decide_policy_env(policy_env: Mapping[str, Any], *, env: str, runtime_target: str, workload: Optional[str]) -> PolicyDecision:
    defaults = policy_env.get("defaults") if isinstance(policy_env.get("defaults"), dict) else {}
    auth_mode = str(defaults.get("auth_mode") or "auto").strip()
    if auth_mode not in AUTH_MODES:
        die(f"policy.env.defaults.auth_mode must be one of {sorted(AUTH_MODES)}, got {auth_mode!r}")

    preflight = defaults.get("preflight") if isinstance(defaults.get("preflight"), dict) else {}
    preflight_mode = str(preflight.get("mode") or "warn").strip()
    if preflight_mode not in PREFLIGHT_MODES:
        die(f"policy.env.defaults.preflight.mode must be one of {sorted(PREFLIGHT_MODES)}, got {preflight_mode!r}")

    evidence = policy_env.get("evidence") if isinstance(policy_env.get("evidence"), dict) else {}
    fallback_dir = str(evidence.get("fallback_dir") or ".ai/.tmp/env/fallback").strip()

    rules = policy_env.get("rules") if isinstance(policy_env.get("rules"), list) else []
    matched: List[Tuple[int, Dict[str, Any]]] = []
    for r in rules:
        if not isinstance(r, dict):
            continue
        match = r.get("match")
        if match is None:
            continue
        if not isinstance(match, dict):
            die("policy.env.rules[].match must be a mapping when present")

        allowed_match_keys = {"env", "runtime_target", "workload"}
        unknown_keys = sorted([k for k in match.keys() if k not in allowed_match_keys])
        if unknown_keys:
            die(f"policy.env.rules[].match has unknown keys: {unknown_keys} (allowed: {sorted(allowed_match_keys)})")

        if "env" in match and str(match.get("env")).strip() != env:
            continue
        if "runtime_target" in match and str(match.get("runtime_target")).strip() != runtime_target:
            continue
        if "workload" in match:
            if workload is None or str(match.get("workload")).strip() != workload:
                continue

        specificity = len([k for k, v in match.items() if v is not None])
        matched.append((specificity, r))

    rule_id: Optional[str] = None
    ak_fallback_record = False
    if matched:
        matched.sort(key=lambda t: t[0], reverse=True)
        top_spec = matched[0][0]
        top = [r for spec, r in matched if spec == top_spec]
        if len(top) > 1:
            ids = [str(r.get("id") or "<missing-id>") for r in top]
            die(f"policy.env.rules has multiple matching rules with same specificity ({top_spec}): {ids}")

        r = top[0]
        rule_id = str(r.get("id")) if isinstance(r.get("id"), str) and str(r.get("id")).strip() else None
        set_cfg = r.get("set") if isinstance(r.get("set"), dict) else {}

        am = set_cfg.get("auth_mode")
        if isinstance(am, str) and am.strip():
            if am.strip() not in AUTH_MODES:
                die(f"policy.env.rules[].set.auth_mode must be one of {sorted(AUTH_MODES)}, got {am!r}")
            auth_mode = am.strip()

        pf = set_cfg.get("preflight") if isinstance(set_cfg.get("preflight"), dict) else {}
        pm = pf.get("mode")
        if isinstance(pm, str) and pm.strip():
            if pm.strip() not in PREFLIGHT_MODES:
                die(f"policy.env.rules[].set.preflight.mode must be one of {sorted(PREFLIGHT_MODES)}, got {pm!r}")
            preflight_mode = pm.strip()

        akfb = set_cfg.get("ak_fallback") if isinstance(set_cfg.get("ak_fallback"), dict) else {}
        ak_fallback_record = bool(akfb.get("record", False))

    return PolicyDecision(
        env=env,
        runtime_target=runtime_target,
        workload=workload,
        auth_mode=auth_mode,
        preflight_mode=preflight_mode,
        rule_id=rule_id,
        fallback_dir=fallback_dir,
        ak_fallback_record=ak_fallback_record,
    )


def _safe_str_list(v: Any) -> List[str]:
    if not isinstance(v, list):
        return []
    out: List[str] = []
    for x in v:
        if isinstance(x, str) and x.strip():
            out.append(x.strip())
    return out


def _map_has(env_map: Mapping[str, Any], var: str) -> bool:
    return bool(str(env_map.get(var) or "").strip())


def detect_preflight_signals(policy_env: Mapping[str, Any], *, env_map: Mapping[str, Any], check_files: bool) -> Dict[str, Any]:
    """Detect potentially unsafe credential-chain signals (no values)."""
    preflight = policy_env.get("preflight") if isinstance(policy_env.get("preflight"), dict) else {}
    detect = preflight.get("detect") if isinstance(preflight.get("detect"), dict) else {}
    providers = detect.get("providers") if isinstance(detect.get("providers"), dict) else {}

    out: Dict[str, Any] = {"providers": {}, "summary": {"has_ak": False, "has_sts": False}}
    all_ak_vars: List[str] = []
    all_sts_vars: List[str] = []
    all_presence_vars: List[str] = []
    all_cred_files: List[str] = []

    for pname, pcfg in providers.items():
        if not isinstance(pname, str) or not isinstance(pcfg, dict):
            continue

        ak_sets: List[Dict[str, Any]] = []
        sts_sets: List[Dict[str, Any]] = []
        presence_vars: List[str] = []
        cred_files: List[str] = []

        for s in pcfg.get("env_credential_sets") if isinstance(pcfg.get("env_credential_sets"), list) else []:
            if not isinstance(s, dict):
                continue
            id_vars = _safe_str_list(s.get("id_vars"))
            secret_vars = _safe_str_list(s.get("secret_vars"))
            token_vars = _safe_str_list(s.get("token_vars"))
            id_var = next((v for v in id_vars if _map_has(env_map, v)), None)
            secret_var = next((v for v in secret_vars if _map_has(env_map, v)), None)
            token_var = next((v for v in token_vars if _map_has(env_map, v)), None)
            if not id_var or not secret_var:
                continue
            if token_var:
                sts_sets.append({"id_var": id_var, "secret_var": secret_var, "token_var": token_var})
                all_sts_vars.extend([id_var, secret_var, token_var])
            else:
                ak_sets.append({"id_var": id_var, "secret_var": secret_var})
                all_ak_vars.extend([id_var, secret_var])

        for v in _safe_str_list(pcfg.get("env_var_presence")):
            if _map_has(env_map, v):
                presence_vars.append(v)
                all_presence_vars.append(v)

        cfiles = pcfg.get("credential_files") if isinstance(pcfg.get("credential_files"), dict) else {}
        if check_files:
            for p in _safe_str_list(cfiles.get("paths")):
                expanded = os.path.expanduser(p)
                if Path(expanded).exists():
                    cred_files.append(p)
                    all_cred_files.append(p)

        out["providers"][pname] = {
            "ak_env": ak_sets,
            "sts_env": sts_sets,
            "env_var_presence": presence_vars,
            "credential_files": cred_files,
        }

    out["summary"]["has_ak"] = bool(all_ak_vars or all_cred_files or all_presence_vars)
    out["summary"]["has_sts"] = bool(all_sts_vars)
    out["summary"]["ak_env_vars"] = sorted(list(set(all_ak_vars)))
    out["summary"]["sts_env_vars"] = sorted(list(set(all_sts_vars)))
    out["summary"]["env_var_presence"] = sorted(list(set(all_presence_vars)))
    out["summary"]["credential_files"] = sorted(list(set(all_cred_files)))
    return out


def _new_run_id() -> str:
    ts = time.strftime("%Y%m%d-%H%M%SZ", time.gmtime())
    return f"{ts}-{uuid.uuid4().hex[:8]}"


def run_policy_preflight(
    root: Path,
    *,
    policy_env: Mapping[str, Any],
    decision: PolicyDecision,
    env_map: Mapping[str, Any],
    check_files: bool,
) -> Tuple[List[str], List[str], Optional[Path]]:
    """Return (errors, warnings, evidence_path)."""
    if decision.preflight_mode == "off":
        return [], [], None

    signals = detect_preflight_signals(policy_env, env_map=env_map, check_files=check_files)
    summary = signals.get("summary") if isinstance(signals.get("summary"), dict) else {}
    has_ak = bool(summary.get("has_ak"))
    has_sts = bool(summary.get("has_sts"))

    ak_env_vars = summary.get("ak_env_vars") if isinstance(summary.get("ak_env_vars"), list) else []
    cred_files = summary.get("credential_files") if isinstance(summary.get("credential_files"), list) else []
    presence_vars = summary.get("env_var_presence") if isinstance(summary.get("env_var_presence"), list) else []

    errors: List[str] = []
    warnings: List[str] = []
    evidence_path: Optional[Path] = None

    if decision.auth_mode == "role-only" and has_ak:
        msg = "Preflight violation (auth_mode=role-only): detected credential-chain signals that may enable AK fallback."
        details: List[str] = []
        if ak_env_vars:
            details.append(f"ak_env_vars={sorted(ak_env_vars)}")
        if presence_vars:
            details.append(f"env_var_presence={sorted(presence_vars)}")
        if cred_files:
            details.append(f"credential_files={sorted(cred_files)}")
        if details:
            msg += " " + "; ".join(details)

        if decision.preflight_mode == "fail":
            errors.append(msg)
        else:
            warnings.append(msg)

    if decision.auth_mode == "auto" and has_ak:
        warnings.append("Preflight: credential-chain signals detected (auth_mode=auto). Ensure AK fallback is intended and scoped to dev(local) only.")

        if decision.ak_fallback_record and (not has_sts):
            base = Path(decision.fallback_dir)
            base = base if base.is_absolute() else (root / base)
            run_id = _new_run_id()
            evidence_path = base / run_id / "preflight.json"
            evidence_path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "generated_at_utc": utc_now_iso(),
                "env": decision.env,
                "runtime_target": decision.runtime_target,
                "workload": decision.workload,
                "auth_mode": decision.auth_mode,
                "rule_id": decision.rule_id,
                "signals": signals,
            }
            evidence_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            warnings.append(f"Preflight evidence recorded (no secrets): {evidence_path}")

    return errors, warnings, evidence_path


PROVIDER_ALIASES = {"ecs-envfile": "envfile", "ssh": "envfile"}


def normalize_provider(provider: str) -> Tuple[str, Optional[str]]:
    p = provider.strip().lower()
    if not p:
        return p, None
    alias = PROVIDER_ALIASES.get(p)
    if alias:
        return alias, p
    return p, None


@dataclass(frozen=True)
class CloudTarget:
    target_id: Optional[str]
    provider: str
    provider_raw: str
    runtime: Optional[str]
    env_file_name: str
    deploy_dir: Optional[str]
    compose_dir: Optional[str]
    ssh: Optional[Dict[str, Any]]
    docker_compose: Optional[Dict[str, Any]]
    health_url: Optional[str]
    health_timeout_ms: int
    injection: Optional[Dict[str, Any]]


def select_cloud_target(policy_env: Mapping[str, Any], *, env: str, workload: Optional[str]) -> CloudTarget:
    cloud = policy_env.get("cloud") if isinstance(policy_env.get("cloud"), dict) else {}
    defaults = cloud.get("defaults") if isinstance(cloud.get("defaults"), dict) else {}
    targets = cloud.get("targets") if isinstance(cloud.get("targets"), list) else []

    default_runtime = str(defaults.get("runtime") or "").strip() or None
    default_env_file_name = str(defaults.get("env_file_name") or "{env}.env").strip()

    matched: List[Tuple[int, Dict[str, Any]]] = []
    for t in targets:
        if not isinstance(t, dict):
            continue
        match = t.get("match")
        if not isinstance(match, dict):
            continue

        allowed_match_keys = {"env", "workload"}
        unknown_keys = sorted([k for k in match.keys() if k not in allowed_match_keys])
        if unknown_keys:
            die(f"policy.env.cloud.targets[].match has unknown keys: {unknown_keys} (allowed: {sorted(allowed_match_keys)})")

        if "env" in match and str(match.get("env")).strip() != env:
            continue
        if "workload" in match:
            if workload is None or str(match.get("workload")).strip() != workload:
                continue

        specificity = len([k for k, v in match.items() if v is not None])
        matched.append((specificity, t))

    if not matched:
        die(f"No cloud target matched for env={env!r} workload={workload!r} (configure policy.env.cloud.targets)")

    matched.sort(key=lambda t: t[0], reverse=True)
    top_spec = matched[0][0]
    top = [t for spec, t in matched if spec == top_spec]
    if len(top) > 1:
        ids = [str(t.get("id") or "<missing-id>") for t in top]
        die(f"policy.env.cloud.targets has multiple matching targets with same specificity ({top_spec}): {ids}")

    t = top[0]
    target_id = str(t.get("id")) if isinstance(t.get("id"), str) and str(t.get("id")).strip() else None
    set_cfg = t.get("set") if isinstance(t.get("set"), dict) else None
    if not isinstance(set_cfg, dict):
        die("policy.env.cloud.targets[].set must be a mapping")

    provider_raw = str(set_cfg.get("provider") or "").strip()
    if not provider_raw:
        die("policy.env.cloud.targets[].set.provider is required (e.g. envfile, mockcloud)")
    provider, provider_alias = normalize_provider(provider_raw)
    if provider not in {"mockcloud", "envfile"}:
        die(f"Unsupported provider {provider_raw!r}; expected envfile or mockcloud")

    runtime = str(set_cfg.get("runtime") or default_runtime or "").strip() or None
    env_file_name = str(set_cfg.get("env_file_name") or default_env_file_name).strip().replace("{env}", env)
    if not env_file_name:
        die("policy.env.cloud.targets[].set.env_file_name is empty after templating")

    deploy_dir = str(set_cfg.get("deploy_dir") or "").strip() or None
    docker_compose = set_cfg.get("docker_compose") if isinstance(set_cfg.get("docker_compose"), dict) else None
    compose_dir = str(set_cfg.get("compose_dir") or "").strip() or None
    if compose_dir is None and deploy_dir is not None:
        compose_dir = deploy_dir
    if deploy_dir is None and compose_dir is not None:
        deploy_dir = compose_dir

    ssh = set_cfg.get("ssh") if isinstance(set_cfg.get("ssh"), dict) else None
    injection = set_cfg.get("injection")
    if injection is not None and not isinstance(injection, dict):
        die("policy.env.cloud.targets[].set.injection must be a mapping when present")
    health_url = str(set_cfg.get("health_url") or "").strip() or None
    health_timeout_ms_raw = set_cfg.get("health_timeout_ms")
    health_timeout_ms = 5000
    if isinstance(health_timeout_ms_raw, int) and health_timeout_ms_raw > 0:
        health_timeout_ms = health_timeout_ms_raw

    return CloudTarget(
        target_id=target_id,
        provider=provider,
        provider_raw=provider_raw if provider_alias is None else provider_alias,
        runtime=runtime,
        env_file_name=env_file_name,
        deploy_dir=deploy_dir,
        compose_dir=compose_dir,
        ssh=ssh,
        docker_compose=docker_compose,
        health_url=health_url,
        health_timeout_ms=health_timeout_ms,
        injection=injection if isinstance(injection, dict) else None,
    )


@dataclass(frozen=True)
class EnvFileInjection:
    transport: str
    target_path: str
    mode: int
    remote_tmp_dir: Optional[str]
    sudo: bool
    ssh_targets: Optional[List[Dict[str, Any]]]
    pre_commands: List[str]
    post_commands: List[str]
    meta_path: Optional[str]


def _normalize_cmd_list(raw: Any, *, field: str) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        return [raw.strip()] if raw.strip() else []
    if isinstance(raw, list):
        out: List[str] = []
        for item in raw:
            if not isinstance(item, str):
                die(f"{field} must be a list of strings")
            if item.strip():
                out.append(item.strip())
        return out
    die(f"{field} must be a string or list of strings")
    return []


def _parse_mode(mode_raw: Any) -> int:
    if mode_raw is None:
        return 0o600
    mode_str = str(mode_raw).strip()
    if not mode_str:
        return 0o600
    if not re.fullmatch(r"[0-7]{3,4}", mode_str):
        die(f"injection.write.mode must be an octal string like '600' (got {mode_raw!r})")
    return int(mode_str, 8)


def _load_hosts_from_file(root: Path, path_str: str) -> List[Any]:
    path = Path(path_str).expanduser()
    if not path.is_absolute():
        path = (root / path).resolve()
    if not path.exists():
        die(f"ssh.hosts_file not found: {path}")
    raw = path.read_text(encoding="utf-8")
    data: Any = None
    try:
        data = yaml_min.safe_load(raw)
    except Exception:  # noqa: BLE001
        data = None

    hosts: List[Any] = []
    if isinstance(data, dict) and isinstance(data.get("hosts"), list):
        hosts = data.get("hosts") or []
    elif isinstance(data, list):
        hosts = data
    else:
        hosts = [line.strip() for line in raw.splitlines() if line.strip() and not line.strip().startswith("#")]
    return hosts


def resolve_ssh_targets(root: Path, ssh_cfg: Mapping[str, Any]) -> List[Dict[str, Any]]:
    if not isinstance(ssh_cfg, dict):
        die("ssh config must be a mapping")
    base = dict(ssh_cfg)
    host_entries: List[Any] = []

    if isinstance(ssh_cfg.get("hosts"), list):
        host_entries.extend(ssh_cfg.get("hosts") or [])

    hosts_file = ssh_cfg.get("hosts_file")
    if isinstance(hosts_file, str) and hosts_file.strip():
        host_entries.extend(_load_hosts_from_file(root, hosts_file.strip()))

    if isinstance(ssh_cfg.get("host"), str) and str(ssh_cfg.get("host")).strip():
        host_entries.append(str(ssh_cfg.get("host")).strip())

    for k in ("host", "hosts", "hosts_file"):
        base.pop(k, None)

    targets: List[Dict[str, Any]] = []
    for entry in host_entries:
        if isinstance(entry, dict):
            host = entry.get("host")
            if not isinstance(host, str) or not host.strip():
                die("ssh.hosts entries must include host")
            cfg = dict(base)
            cfg.update(entry)
            cfg["host"] = host.strip()
            targets.append(cfg)
            continue

        if isinstance(entry, (str, int, float)):
            host_str = str(entry).strip()
            if not host_str:
                continue
            cfg = dict(base)
            if "@" in host_str:
                user, host_only = host_str.split("@", 1)
                if user:
                    cfg["user"] = user
                cfg["host"] = host_only
            else:
                cfg["host"] = host_str
            targets.append(cfg)
            continue

        die("ssh.hosts entries must be strings or mappings")

    if not targets:
        die("ssh config requires host/hosts/hosts_file")
    return targets


def _format_ssh_target(ssh_cfg: Mapping[str, Any]) -> str:
    host = str(ssh_cfg.get("host") or "").strip()
    user = str(ssh_cfg.get("user") or "").strip()
    return f"{user}@{host}" if user else host


def normalize_envfile_injection(root: Path, target: CloudTarget, env: str) -> Tuple[EnvFileInjection, List[str]]:
    warnings: List[str] = []
    inj = target.injection or {}
    if inj and not isinstance(inj, dict):
        die("injection must be a mapping")

    transport = str(inj.get("transport") or "").strip().lower()
    if not transport:
        transport = "ssh" if (inj.get("ssh") or target.ssh) else "local"
    if transport not in {"local", "ssh"}:
        die(f"injection.transport must be one of ['local', 'ssh'] (got {transport!r})")

    raw_target = inj.get("target")
    if raw_target is None:
        if target.deploy_dir:
            if "/" in (target.env_file_name or ""):
                die("env_file_name must be a simple file name when using deploy_dir fallback")
            raw_target = posixpath.join(target.deploy_dir, target.env_file_name)
        else:
            die("envfile injection requires injection.target or deploy_dir + env_file_name")

    target_path_raw = str(raw_target).strip().replace("{env}", env)
    if not target_path_raw:
        die("injection.target resolves to empty path")

    meta_path: Optional[str] = None
    if transport == "ssh":
        if not target_path_raw.startswith("/"):
            die("injection.target must be an absolute path for ssh transport")
        target_path = target_path_raw
        meta_path = posixpath.join(posixpath.dirname(target_path), ".envctl", f"{env}.meta.json")
    else:
        target_path = str((root / target_path_raw).resolve()) if not Path(target_path_raw).is_absolute() else target_path_raw

    write_cfg = inj.get("write") if isinstance(inj.get("write"), dict) else {}
    mode = _parse_mode(write_cfg.get("mode"))
    remote_tmp_dir = str(write_cfg.get("remote_tmp_dir") or "").strip() or None
    if remote_tmp_dir and transport == "ssh" and not remote_tmp_dir.startswith("/"):
        die("injection.write.remote_tmp_dir must be an absolute path for ssh transport")
    sudo = bool(write_cfg.get("sudo", False))

    pre_commands = _normalize_cmd_list(inj.get("pre_commands"), field="injection.pre_commands")
    post_commands = _normalize_cmd_list(inj.get("post_commands"), field="injection.post_commands")

    if target.docker_compose or target.compose_dir:
        if not post_commands:
            compose_dir = target.compose_dir
            if not compose_dir:
                die("compose_dir is required when using docker_compose legacy config")

            docker_cfg = target.docker_compose or {}
            cmd_raw = docker_cfg.get("command")
            if isinstance(cmd_raw, list):
                base_cmd = [str(x).strip() for x in cmd_raw if isinstance(x, (str, int, float)) and str(x).strip()]
            elif isinstance(cmd_raw, str) and cmd_raw.strip():
                base_cmd = shlex.split(cmd_raw.strip())
            else:
                base_cmd = ["docker", "compose"]

            extra_args: List[str] = []
            if isinstance(docker_cfg.get("args"), list):
                extra_args = [str(x).strip() for x in docker_cfg.get("args") if isinstance(x, (str, int, float)) and str(x).strip()]

            cmd_args = [*base_cmd, *extra_args, "--env-file", target_path, "up", "-d"]
            compose_cmd = f"cd {_sh_quote(compose_dir)} && {_sh_join(cmd_args)}"
            post_commands = [compose_cmd]
            warnings.append("docker_compose config is deprecated; use injection.post_commands instead")

    ssh_cfg = inj.get("ssh") if isinstance(inj.get("ssh"), dict) else None
    if ssh_cfg is None:
        ssh_cfg = target.ssh
    ssh_targets: Optional[List[Dict[str, Any]]] = None
    if transport == "ssh":
        if not isinstance(ssh_cfg, dict):
            die("ssh config is required for ssh transport")
        ssh_targets = resolve_ssh_targets(root, ssh_cfg)

    return (
        EnvFileInjection(
            transport=transport,
            target_path=target_path,
            mode=mode,
            remote_tmp_dir=remote_tmp_dir,
            sudo=sudo,
            ssh_targets=ssh_targets,
            pre_commands=pre_commands,
            post_commands=post_commands,
            meta_path=meta_path,
        ),
        warnings,
    )


@dataclass
class ContractVar:
    name: str
    vtype: str
    required: bool
    default: Any
    description: str
    secret: bool
    secret_ref: Optional[str]
    scopes: Optional[List[str]]
    state: str  # active|deprecated|removed
    deprecate_after: Optional[str]
    replacement: Optional[str]
    rename_from: Optional[str]


def parse_contract(root: Path) -> Tuple[List[ContractVar], List[str]]:
    contract_path = root / "env" / "contract.yaml"
    if not contract_path.exists():
        die(f"Missing contract file: {contract_path}")

    raw = load_yaml(contract_path)
    if not isinstance(raw, dict):
        die("env/contract.yaml must be a YAML mapping")

    variables = raw.get("variables")
    if not isinstance(variables, dict):
        die("env/contract.yaml must contain 'variables' mapping")

    envs: List[str] = []
    if isinstance(raw.get("environments"), list):
        envs = [str(e) for e in raw.get("environments") if str(e).strip()]

    out: List[ContractVar] = []
    for name, meta in variables.items():
        if not isinstance(name, str):
            continue
        if not ENV_VAR_RE.match(name):
            die(f"Invalid env var name in contract: {name!r}")
        if not isinstance(meta, dict):
            die(f"Contract var '{name}' must be a mapping")

        vtype = str(meta.get("type") or "").strip()
        if vtype not in ALLOWED_TYPES:
            die(f"Contract var '{name}' has unsupported type: {vtype!r}")

        # Lifecycle (backward compatible):
        # - preferred: state: active|deprecated|removed
        # - legacy: deprecated: true
        state_raw = meta.get("state")
        deprecated_raw = meta.get("deprecated")
        state: str
        if isinstance(state_raw, str) and state_raw.strip():
            state = state_raw.strip()
        elif deprecated_raw is True:
            state = "deprecated"
        else:
            state = "active"
        if state not in LIFECYCLE_STATES:
            die(f"Contract var '{name}' has invalid state: {state!r} (allowed: {sorted(LIFECYCLE_STATES)})")
        if deprecated_raw is True and state != "deprecated":
            die(f"Contract var '{name}' sets deprecated=true but state={state!r}")

        deprecate_after = meta.get("deprecate_after")
        if deprecate_after is not None:
            if not isinstance(deprecate_after, str) or not _DATE_YYYY_MM_DD_RE.match(deprecate_after.strip()):
                die(f"Contract var '{name}' deprecate_after must be YYYY-MM-DD if present")
            if state != "deprecated":
                die(f"Contract var '{name}' deprecate_after is only valid when state='deprecated'")
            deprecate_after = deprecate_after.strip()

        replacement = meta.get("replacement")
        replaced_by = meta.get("replaced_by")
        if replacement is None and replaced_by is not None:
            replacement = replaced_by
        if replacement is not None:
            if not isinstance(replacement, str) or not ENV_VAR_RE.match(replacement):
                die(f"Contract var '{name}' replacement must be a valid env var name if present")
            if state != "deprecated":
                die(f"Contract var '{name}' replacement is only valid when state='deprecated'")

        rename_from: Optional[str] = None
        migration = meta.get("migration")
        if migration is not None:
            if not isinstance(migration, dict):
                die(f"Contract var '{name}' migration must be a mapping if present")
            rf = migration.get("rename_from")
            if rf is not None:
                if not isinstance(rf, str) or not ENV_VAR_RE.match(rf):
                    die(f"Contract var '{name}' migration.rename_from must be a valid env var name if present")
                if rf == name:
                    die(f"Contract var '{name}' migration.rename_from must not equal the var name")
                rename_from = rf

        required = bool(meta.get("required", False))
        default = meta.get("default")
        description = str(meta.get("description") or "").strip()

        secret = bool(meta.get("secret", False))
        secret_ref = meta.get("secret_ref")
        if secret:
            if not isinstance(secret_ref, str) or not secret_ref.strip():
                die(f"Contract var '{name}' is secret but missing secret_ref")
            if "default" in meta:
                die(f"Contract var '{name}' is secret and must not define a default")
        else:
            secret_ref = None

        scopes = meta.get("scopes")
        if scopes is not None:
            if not isinstance(scopes, list) or any(not isinstance(s, (str, int)) for s in scopes):
                die(f"Contract var '{name}': scopes must be a list of env names")
            scopes = [str(s) for s in scopes]

        out.append(
            ContractVar(
                name=name,
                vtype=vtype,
                required=required,
                default=default,
                description=description,
                secret=secret,
                secret_ref=secret_ref,
                scopes=scopes,
                state=state,
                deprecate_after=deprecate_after if isinstance(deprecate_after, str) else None,
                replacement=replacement if isinstance(replacement, str) else None,
                rename_from=rename_from,
            )
        )

    # Validate rename_from collisions / conflicts.
    rename_from_to: Dict[str, str] = {}
    by_name = {v.name: v for v in out}
    for v in out:
        if not v.rename_from:
            continue
        old = v.rename_from
        if old in rename_from_to and rename_from_to[old] != v.name:
            die(f"Contract rename_from collision: {old} -> {rename_from_to[old]} and {v.name}")
        rename_from_to[old] = v.name

    for old, new in rename_from_to.items():
        old_def = by_name.get(old)
        if old_def and old_def.state != "removed":
            die(f"Contract rename_from conflict: {new} declares rename_from={old} but {old} exists and is not state='removed'")

    return out, envs


def is_in_scope(var: ContractVar, env: str) -> bool:
    return var.scopes is None or env in var.scopes



def type_check_value(var: ContractVar, value: Any) -> Optional[str]:
    t = var.vtype
    if t == "string":
        return None if isinstance(value, str) else "expected string"
    if t == "url":
        return None if isinstance(value, str) else "expected url string"
    if t == "int":
        return None if isinstance(value, int) and not isinstance(value, bool) else "expected int"
    if t == "float":
        return None if isinstance(value, (int, float)) and not isinstance(value, bool) else "expected float"
    if t == "bool":
        return None if isinstance(value, bool) else "expected bool"
    if t == "json":
        return None if isinstance(value, (dict, list, str, int, float, bool)) else "expected json-like"
    if t == "enum":
        if not isinstance(value, str):
            return "expected enum string"
        # Enum options are validated in contractctl/localctl; keep cloudctl light.
        return None
    return None


def load_values(root: Path, env: str) -> Dict[str, Any]:
    values_path = root / "env" / "values" / f"{env}.yaml"
    if not values_path.exists():
        return {}
    data = load_yaml(values_path)
    if data is None:
        return {}
    if not isinstance(data, dict):
        die(f"Values file must be a mapping: {values_path}")
    out: Dict[str, Any] = {}
    for k, v in data.items():
        if not isinstance(k, str) or not ENV_VAR_RE.match(k):
            die(f"Invalid key in values file {values_path}: {k!r}")
        out[k] = v
    return out


def load_secrets_ref(root: Path, env: str) -> Dict[str, Dict[str, Any]]:
    ref_path = root / "env" / "secrets" / f"{env}.ref.yaml"
    if not ref_path.exists():
        die(f"Missing secrets ref file: {ref_path}")
    data = load_yaml(ref_path)
    if not isinstance(data, dict):
        die(f"Secrets ref file must be a mapping: {ref_path}")
    if "secrets" not in data or not isinstance(data.get("secrets"), dict):
        die(f"Secrets ref file must have top-level 'secrets' mapping: {ref_path}")
    secrets = data["secrets"]

    out: Dict[str, Dict[str, Any]] = {}
    for name, meta in secrets.items():
        if not isinstance(name, str):
            continue
        if not isinstance(meta, dict):
            die(f"Secret ref '{name}' must be a mapping in {ref_path}")
        if "ref" in meta:
            die(
                f"Secret ref '{name}' uses legacy key 'ref' in {ref_path}. "
                "This is not supported (to avoid dual semantics). Remove 'ref' and use structured fields only."
            )
        if "value" in meta:
            die(
                f"Secret ref '{name}' contains forbidden key 'value' in {ref_path}. "
                "Secret values must never be stored in repo files."
            )
        backend = str(meta.get("backend") or "").strip()
        if not backend:
            die(f"Secret ref '{name}' must specify backend in {ref_path}")

        if backend == "mock":
            pass
        elif backend == "env":
            env_var = meta.get("env_var")
            if not isinstance(env_var, str) or not ENV_VAR_RE.match(env_var.strip()):
                die(f"Secret ref '{name}' env backend requires env_var (e.g. OAUTH_CLIENT_SECRET) in {ref_path}")
        elif backend == "file":
            p = meta.get("path")
            if not isinstance(p, str) or not p.strip():
                die(f"Secret ref '{name}' file backend requires non-empty path in {ref_path}")
        elif backend == "bws":
            scope = meta.get("scope")
            if not isinstance(scope, str) or scope.strip() not in {"project", "shared"}:
                die(f"Secret ref '{name}' bws backend requires scope: project|shared in {ref_path}")
        else:
            die(f"Unsupported secret backend {backend!r} for secret ref '{name}' in {ref_path} (supported: mock, env, file, bws)")

        out[name] = dict(meta)

    return out


def _is_placeholder(s: str) -> bool:
    return "<org>" in s or "<project>" in s


def _policy_bws(policy_env: Mapping[str, Any]) -> Dict[str, Any]:
    secrets = policy_env.get("secrets") if isinstance(policy_env.get("secrets"), dict) else {}
    backends = secrets.get("backends") if isinstance(secrets.get("backends"), dict) else {}
    bws = backends.get("bws") if isinstance(backends.get("bws"), dict) else None
    if not isinstance(bws, dict):
        die("policy.env.secrets.backends.bws is missing or invalid")
    return bws


def bws_project_name(policy_env: Mapping[str, Any], *, env: str) -> str:
    bws = _policy_bws(policy_env)
    projects = bws.get("projects") if isinstance(bws.get("projects"), dict) else {}
    name = projects.get(env)
    if not isinstance(name, str) or not name.strip():
        die(f"policy.env.secrets.backends.bws.projects.{env} is missing")
    if _is_placeholder(name):
        die(f"policy.env.secrets.backends.bws.projects.{env} is a placeholder; update docs/project/policy.yaml")
    return name.strip()


def bws_secret_key(policy_env: Mapping[str, Any], *, env: str, secret_name: str, scope: str) -> str:
    bws = _policy_bws(policy_env)
    keys = bws.get("keys") if isinstance(bws.get("keys"), dict) else {}
    project_prefix = str(keys.get("project_prefix") or "project/{env}/")
    shared_prefix = str(keys.get("shared_prefix") or "shared/")
    prefix = shared_prefix if scope == "shared" else project_prefix.replace("{env}", env)
    if not prefix:
        die("policy.env.secrets.backends.bws.keys prefix is empty")
    return f"{prefix}{secret_name}"


def stable_secret_ref(policy_env: Mapping[str, Any], *, env: str, secret_name: str, cfg: Mapping[str, Any]) -> str:
    backend = str(cfg.get("backend") or "").strip()
    if backend == "mock":
        return f"mock://{env}/{secret_name}"
    if backend == "env":
        env_var = str(cfg.get("env_var") or "").strip()
        return f"env_var:{env_var}"
    if backend == "file":
        p = str(cfg.get("path") or "").strip()
        return f"path:{p}"
    if backend == "bws":
        scope = str(cfg.get("scope") or "").strip()
        project_id = str(cfg.get("project_id") or "").strip() or None
        project_name = str(cfg.get("project_name") or "").strip() or None
        if project_id is None:
            project_name = project_name or bws_project_name(policy_env, env=env)
        key = str(cfg.get("key") or "").strip() or bws_secret_key(policy_env, env=env, secret_name=secret_name, scope=scope)
        proj = project_id or project_name or "<missing-project>"
        return f"bws://{proj}?key={key}"
    return f"<unsupported:{backend}>"


@dataclass
class DesiredState:
    env: str
    provider: str
    runtime: Optional[str]
    config: Dict[str, Any]  # non-secret values
    secrets: Dict[str, Dict[str, Any]]  # secret refs only (stable; no values)
    secrets_cfg: Dict[str, Dict[str, Any]]  # raw secret backend config (no values)
    var_to_secret_ref: Dict[str, str]  # variable name -> secret_ref
    warnings: List[str]  # non-fatal issues (e.g., deprecated/legacy keys)
    envfile: Optional[EnvFileInjection]
    policy_doc: Dict[str, Any]
    policy_env: Dict[str, Any]
    policy_decision: PolicyDecision
    target: CloudTarget


def build_desired_state(root: Path, env: str, workload: Optional[str]) -> DesiredState:
    ensure_ssot_mode(root)
    contract_vars, _contract_envs = parse_contract(root)
    policy_doc = load_policy_doc(root)
    policy_env = get_policy_env(policy_doc)
    policy_decision = decide_policy_env(policy_env, env=env, runtime_target="ecs", workload=workload)
    target = select_cloud_target(policy_env, env=env, workload=workload)

    values = load_values(root, env)
    secrets_ref = load_secrets_ref(root, env)

    values_path = root / "env" / "values" / f"{env}.yaml"

    provider = target.provider
    runtime = target.runtime

    config: Dict[str, Any] = {}
    secrets: Dict[str, Dict[str, Any]] = {}
    secrets_cfg: Dict[str, Dict[str, Any]] = {}
    var_to_secret: Dict[str, str] = {}
    warnings: List[str] = []
    if target.provider_raw and target.provider_raw.lower() != provider:
        warnings.append(f"Provider alias '{target.provider_raw}' is deprecated; use '{provider}'.")

    envfile_injection: Optional[EnvFileInjection] = None
    if provider == "envfile":
        envfile_injection, inj_warnings = normalize_envfile_injection(root, target, env)
        warnings.extend(inj_warnings)

    # Compute non-secret config with defaults + values.
    for var in contract_vars:
        if not is_in_scope(var, env):
            continue
        if var.state == "removed":
            continue
        if var.secret:
            assert var.secret_ref is not None
            ref_name = var.secret_ref
            if ref_name not in secrets_ref:
                die(f"Missing secret ref '{ref_name}' required by contract var '{var.name}' for env '{env}'")
            secrets_cfg[ref_name] = secrets_ref[ref_name]
            secrets[ref_name] = {
                "backend": str(secrets_ref[ref_name].get("backend") or "").strip(),
                "stable_ref": stable_secret_ref(policy_env, env=env, secret_name=ref_name, cfg=secrets_ref[ref_name]),
            }
            var_to_secret[var.name] = ref_name
        else:
            # Start with default if present.
            if var.default is not None:
                config[var.name] = var.default

    contract_by_name = {v.name: v for v in contract_vars}
    rename_map = {v.rename_from: v.name for v in contract_vars if v.rename_from}

    # Values override defaults (non-secret only), with strict validation.
    for raw_key, raw_value in values.items():
        key = raw_key
        vdef = contract_by_name.get(raw_key)

        if vdef is None and raw_key in rename_map:
            key = rename_map[raw_key]
            if key in values:
                die(
                    f"Conflicting keys in values file {values_path}: both legacy {raw_key} and new {key} are set. Remove {raw_key}."
                )
            warnings.append(f"Legacy key used in values file {values_path}: {raw_key} -> {key} (migration.rename_from).")
            vdef = contract_by_name.get(key)

        if vdef is None:
            die(f"Unknown key in values file {values_path}: {raw_key} (only contract keys are allowed)")

        if vdef.state == "removed":
            die(f"Removed contract key set in values file {values_path}: {raw_key}")

        if vdef.secret:
            die(f"Values file must not include secret variable: {raw_key} (use env/secrets/{env}.ref.yaml)")

        if not is_in_scope(vdef, env):
            die(f"Values file sets out-of-scope key {raw_key} (resolved to {key}) for env '{env}'")

        if vdef.state == "deprecated":
            msg = f"Deprecated contract key set in values file {values_path}: {key}"
            if vdef.deprecate_after:
                msg += f" (deprecate_after={vdef.deprecate_after})"
            if vdef.replacement:
                msg += f" (replacement={vdef.replacement})"
            warnings.append(msg)

        t_err = type_check_value(vdef, raw_value)
        if t_err:
            die(f"Type check failed for {raw_key} in values file {values_path}: {t_err}")
        config[key] = raw_value

    # Force-set environment selector if present
    for v in contract_vars:
        if v.name == "APP_ENV" and v.state != "removed":
            config["APP_ENV"] = env
            break

    # Validate: ensure required keys exist
    for var in contract_vars:
        if not is_in_scope(var, env):
            continue
        if var.state == "removed":
            continue
        if var.secret:
            continue
        if var.required and (var.name not in config or config.get(var.name) in (None, '')):
            die(f"Missing required non-secret value for env '{env}': {var.name}")

    # Policy preflight: run on the effective env-map shape (no secret values).
    preflight_env: Dict[str, Any] = dict(config)
    for var_name in var_to_secret.keys():
        preflight_env[var_name] = "***REDACTED***"
    p_errors, p_warnings, _p_ev = run_policy_preflight(
        root,
        policy_env=policy_env,
        decision=policy_decision,
        env_map=preflight_env,
        check_files=False,
    )
    warnings.extend(p_warnings)
    if p_errors:
        die("; ".join(p_errors))

    return DesiredState(
        env=env,
        provider=provider,
        runtime=runtime,
        config=config,
        secrets=secrets,
        secrets_cfg=secrets_cfg,
        var_to_secret_ref=var_to_secret,
        warnings=warnings,
        envfile=envfile_injection,
        policy_doc=policy_doc,
        policy_env=policy_env,
        policy_decision=policy_decision,
        target=target,
    )


def mock_state_dir(root: Path, env: str) -> Path:
    return root / ".ai" / "mock-cloud" / env


def load_mock_deployed_state(root: Path, env: str) -> Optional[Dict[str, Any]]:
    sdir = mock_state_dir(root, env)
    path = sdir / "state.json"
    if not path.exists():
        return None
    return load_json(path)


def write_mock_deployed_state(root: Path, env: str, state: Dict[str, Any]) -> None:
    sdir = mock_state_dir(root, env)
    sdir.mkdir(parents=True, exist_ok=True)
    path = sdir / "state.json"
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def envcloud_state_dir(root: Path, env: str) -> Path:
    return root / ".ai" / ".tmp" / "env-cloud" / env


def load_local_envcloud_state(root: Path, env: str) -> Optional[Dict[str, Any]]:
    sdir = envcloud_state_dir(root, env)
    path = sdir / "state.json"
    if not path.exists():
        return None
    return load_json(path)


def write_local_envcloud_state(root: Path, env: str, state: Dict[str, Any]) -> None:
    sdir = envcloud_state_dir(root, env)
    sdir.mkdir(parents=True, exist_ok=True)
    path = sdir / "state.json"
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_ssh_deployed_state(desired: DesiredState, *, approve_remote: bool) -> Optional[Dict[str, Any]]:
    if desired.provider != "envfile":
        die(f"load_ssh_deployed_state called with provider={desired.provider!r}")
    inj = desired.envfile
    if not inj or inj.transport != "ssh":
        die("load_ssh_deployed_state requires envfile ssh transport")
    if not inj.ssh_targets:
        die("ssh targets are required for envfile ssh transport")
    if not inj.meta_path:
        die("envfile meta_path is required for ssh transport")
    ssh_cfg = inj.ssh_targets[0]
    meta_path = inj.meta_path
    script = "\n".join(
        [
            "set -e",
            f"meta={_sh_quote(meta_path)}",
            "if [ -f \"$meta\" ]; then cat \"$meta\"; else exit 3; fi",
        ]
    )
    res = _ssh_run(
        ssh_cfg,
        script=script,
        input_text=None,
        sensitive=False,
        approve_remote=approve_remote,
        action="Remote deployed-state read",
    )

    if res.returncode == 3:
        return None

    try:
        data = json.loads(res.stdout)
    except Exception as e:  # noqa: BLE001
        die(f"Remote meta file is not valid JSON: {e}")
    if not isinstance(data, dict):
        die("Remote meta file must be a JSON object")
    return data


def load_deployed_state_for_desired(
    root: Path,
    desired: DesiredState,
    *,
    remote: bool,
    approve_remote: bool,
) -> Optional[Dict[str, Any]]:
    if desired.provider == "mockcloud":
        return load_mock_deployed_state(root, desired.env)
    if desired.provider == "envfile":
        inj = desired.envfile
        if inj and inj.transport == "ssh":
            if remote:
                return load_ssh_deployed_state(desired, approve_remote=approve_remote)
            return load_local_envcloud_state(root, desired.env)
        return load_local_envcloud_state(root, desired.env)
    die(f"Unsupported provider for deployed-state loading: {desired.provider!r}")
    return None  # unreachable


def diff_maps(old: Mapping[str, Any], new: Mapping[str, Any]) -> Dict[str, Any]:
    old_keys = set(old.keys())
    new_keys = set(new.keys())
    added = {k: new[k] for k in sorted(new_keys - old_keys)}
    removed = {k: old[k] for k in sorted(old_keys - new_keys)}
    changed: Dict[str, Dict[str, Any]] = {}
    for k in sorted(old_keys & new_keys):
        if old[k] != new[k]:
            changed[k] = {"from": old[k], "to": new[k]}
    return {"added": added, "removed": removed, "changed": changed}


def diff_state(desired: DesiredState, deployed: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if deployed is None:
        return {
            "env": desired.env,
            "provider": desired.provider,
            "status": "CREATE",
            "config": {"added": desired.config, "removed": {}, "changed": {}},
            "secrets": {"added": desired.secrets, "removed": {}, "changed": {}},
        }

    old_cfg = deployed.get("config") or {}
    old_sec = deployed.get("secrets") or {}
    if not isinstance(old_cfg, dict):
        old_cfg = {}
    if not isinstance(old_sec, dict):
        old_sec = {}

    # Normalize deployed secret metadata to compare only stable fields.
    # Deployed state may include provider-side fields like version/rotated_at.
    normalized_old_sec: Dict[str, Any] = {}
    for k, v in old_sec.items():
        if isinstance(v, dict):
            normalized_old_sec[k] = {
                "backend": v.get("backend"),
                "stable_ref": v.get("stable_ref") if v.get("stable_ref") is not None else v.get("ref"),
            }
        else:
            normalized_old_sec[k] = {"backend": None, "stable_ref": v}

    cfg_diff = diff_maps(old_cfg, desired.config)
    sec_diff = diff_maps(normalized_old_sec, desired.secrets)

    status = "NOOP"
    if cfg_diff["added"] or cfg_diff["removed"] or cfg_diff["changed"] or sec_diff["added"] or sec_diff["removed"] or sec_diff["changed"]:
        status = "UPDATE"

    return {
        "env": desired.env,
        "provider": desired.provider,
        "status": status,
        "config": cfg_diff,
        "secrets": sec_diff,
        "deployed_at": deployed.get("applied_at"),
    }


def render_plan_md(desired: DesiredState, deployed: Optional[Dict[str, Any]], plan: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Cloud Environment Plan")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{utc_now_iso()}`")
    lines.append("- Status: **PASS**")
    lines.append(f"- Env: `{desired.env}`")
    lines.append(f"- Provider: `{desired.provider}`")
    if desired.runtime:
        lines.append(f"- Runtime: `{desired.runtime}`")
    if desired.envfile:
        lines.append(f"- Transport: `{desired.envfile.transport}`")
        lines.append(f"- Env-file target: `{desired.envfile.target_path}`")
    lines.append(f"- Change status: **{plan['status']}**")
    if deployed is None:
        lines.append("- Deployed: (none)")
    else:
        lines.append(f"- Deployed at: `{deployed.get('applied_at')}`")
    lines.append("")

    if desired.warnings:
        lines.append("## Warnings")
        for w in desired.warnings:
            lines.append(f"- {w}")
        lines.append("")

    remote_note = plan.get("remote_checked") is False
    if remote_note:
        lines.append("## Remote check")
        lines.append("- Deployed state not read from remote host. Pass `--remote --approve-remote` to enable.")
        lines.append("")

    def _render_diff(title: str, d: Dict[str, Any]) -> None:
        lines.append(f"## {title}")
        lines.append("")
        lines.append(f"- Added: {len(d.get('added') or {})}")
        lines.append(f"- Removed: {len(d.get('removed') or {})}")
        lines.append(f"- Changed: {len(d.get('changed') or {})}")
        lines.append("")

    _render_diff("Config changes (non-secret)", plan["config"])
    _render_diff("Secret ref changes (no values)", plan["secrets"])

    lines.append("## Plan JSON (redacted)")
    lines.append("```json")
    lines.append(json.dumps(plan, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Secret values are never included. Only secret references are compared.")
    lines.append("- Apply requires explicit `--approve`.")
    lines.append("- SSH transport requires explicit `--approve-remote` for any remote command.")
    return "\n".join(lines) + "\n"


def write_cloud_context(root: Path, desired: DesiredState) -> Path:
    out_path = root / "docs" / "context" / "env" / f"effective-cloud-{desired.env}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": utc_now_iso(),
        "env": desired.env,
        "provider": desired.provider,
        "runtime": desired.runtime,
        "config": desired.config,
        "secrets": desired.secrets,
        "var_to_secret_ref": desired.var_to_secret_ref,
        "redaction": {"secrets": "values omitted"},
    }
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return out_path


def _sh_quote(s: str) -> str:
    return "'" + s.replace("'", "'\"'\"'") + "'"


def _sh_join(args: Sequence[str]) -> str:
    return " ".join(_sh_quote(str(a)) for a in args)


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _read_text_secret_value(path: Path) -> str:
    return _read_text(path).rstrip("\n")


def _bws_access_token_present() -> bool:
    return bool(str(os.getenv("BWS_ACCESS_TOKEN") or "").strip())


def require_remote_approval(approve_remote: bool, *, action: str) -> None:
    if not approve_remote:
        die(f"{action} requires --approve-remote")


def _bws_run_json(args: Sequence[str]) -> Tuple[Optional[Any], Optional[str]]:
    cmd = ["bws", *list(args), "--output", "json", "--color", "no"]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return None, "bws CLI not found in PATH (install Bitwarden Secrets Manager CLI: bws)"
    except Exception as e:  # noqa: BLE001
        return None, f"bws command failed to start: {e}"

    if res.returncode != 0:
        # Never include stdout/stderr to avoid accidental leaks on CLI errors.
        return None, f"bws command failed (exit code {res.returncode}): {' '.join(cmd[:3])} ..."

    try:
        return json.loads(res.stdout), None
    except Exception as e:  # noqa: BLE001
        return None, f"bws returned non-JSON output: {e}"


@dataclass
class _BwsCache:
    project_name_to_id: Dict[str, str]
    project_id_to_key_to_id: Dict[str, Dict[str, str]]


def new_bws_cache() -> _BwsCache:
    return _BwsCache(project_name_to_id={}, project_id_to_key_to_id={})


def _bws_project_id_for_name(cache: _BwsCache, project_name: str) -> str:
    cached = cache.project_name_to_id.get(project_name)
    if cached:
        return cached
    data, err = _bws_run_json(["project", "list"])
    if err:
        die(err)
    if not isinstance(data, list):
        die("bws project list returned unexpected JSON shape")
    for p in data:
        if not isinstance(p, dict):
            continue
        name = p.get("name")
        pid = p.get("id")
        if isinstance(name, str) and isinstance(pid, str) and name == project_name:
            cache.project_name_to_id[project_name] = pid
            return pid
    die(f"bws project not found: {project_name!r}")
    return ""  # unreachable


def _bws_secret_id_for_key(cache: _BwsCache, project_id: str, key: str) -> str:
    cached = cache.project_id_to_key_to_id.get(project_id)
    if cached and key in cached:
        return cached[key]

    data, err = _bws_run_json(["secret", "list", project_id])
    if err:
        die(err)
    if not isinstance(data, list):
        die("bws secret list returned unexpected JSON shape")

    key_to_id: Dict[str, str] = {}
    for s in data:
        if not isinstance(s, dict):
            continue
        sid = s.get("id")
        skey = s.get("key")
        if isinstance(sid, str) and isinstance(skey, str):
            key_to_id[skey] = sid
    cache.project_id_to_key_to_id[project_id] = key_to_id

    if key not in key_to_id:
        die(f"bws secret key not found in project {project_id!r}: {key!r}")
    return key_to_id[key]


def _bws_secret_value(secret_id: str) -> str:
    data, err = _bws_run_json(["secret", "get", secret_id])
    if err:
        die(err)
    if not isinstance(data, dict):
        die("bws secret get returned unexpected JSON shape")
    value = data.get("value")
    if not isinstance(value, str):
        die("bws secret get JSON does not contain string field 'value'")
    return value


def resolve_secret_value(root: Path, policy_env: Mapping[str, Any], *, env: str, secret_name: str, cfg: Mapping[str, Any], bws: _BwsCache) -> str:
    backend = str(cfg.get("backend") or "").strip()

    if backend == "mock":
        store_path = root / "env" / ".secrets-store" / env / secret_name
        if not store_path.exists():
            die(f"mock secret missing: create {store_path}")
        return _read_text_secret_value(store_path)

    if backend == "env":
        env_var = str(cfg.get("env_var") or "").strip()
        if not env_var:
            die(f"Secret {secret_name!r}: env backend requires env_var")
        val = os.getenv(env_var)
        if val is None:
            die(f"Secret {secret_name!r}: missing environment variable for env backend: {env_var}")
        return val

    if backend == "file":
        p = str(cfg.get("path") or "").strip()
        if not p:
            die(f"Secret {secret_name!r}: file backend requires path")
        path = Path(p)
        if not path.is_absolute():
            path = (root / path).resolve()
        if not path.exists():
            die(f"Secret {secret_name!r}: file backend missing: {path}")
        return _read_text_secret_value(path)

    if backend == "bws":
        if not _bws_access_token_present():
            die("bws backend requires BWS_ACCESS_TOKEN in the environment")
        scope = str(cfg.get("scope") or "").strip()
        if scope not in {"project", "shared"}:
            die(f"Secret {secret_name!r}: bws backend requires scope: project|shared")

        project_id = str(cfg.get("project_id") or "").strip() or None
        if project_id is None:
            project_name = str(cfg.get("project_name") or "").strip() or None
            if project_name is None:
                project_name = bws_project_name(policy_env, env=env)
            project_id = _bws_project_id_for_name(bws, project_name)

        key = str(cfg.get("key") or "").strip() or None
        if key is None:
            key = bws_secret_key(policy_env, env=env, secret_name=secret_name, scope=scope)

        sid = _bws_secret_id_for_key(bws, project_id, key)
        return _bws_secret_value(sid).rstrip("\n")

    die(f"Unsupported secret backend {backend!r} for {secret_name!r} (supported: mock, env, file, bws)")
    return ""  # unreachable


def _dotenv_quote(s: str) -> str:
    escaped = s.replace("\\", "\\\\").replace("\r", "\\r").replace("\n", "\\n").replace('"', '\\"')
    return f"\"{escaped}\""


def render_env_file(kv: Mapping[str, Any], *, header: str) -> str:
    lines: List[str] = []
    lines.append(f"# {header}")
    lines.append(f"# Generated at: {utc_now_iso()}")
    lines.append("")
    for k in sorted(kv.keys()):
        v = kv[k]
        if isinstance(v, bool):
            s = "true" if v else "false"
        elif v is None:
            s = ""
        elif isinstance(v, (dict, list)):
            s = json.dumps(v, separators=(",", ":"), ensure_ascii=False)
        else:
            s = str(v)
            if re.search(r"[\\s#\"'\\\\]", s):
                s = _dotenv_quote(s)
        lines.append(f"{k}={s}")
    return "\n".join(lines) + "\n"


def _ssh_remote_and_prefix(ssh_cfg: Mapping[str, Any]) -> Tuple[str, List[str]]:
    host = str(ssh_cfg.get("host") or "").strip()
    if not host:
        die("ssh config requires host (or hosts/hosts_file)")
    user = str(ssh_cfg.get("user") or "").strip() or None
    remote = f"{user}@{host}" if user else host

    prefix: List[str] = ["ssh", "-o", "BatchMode=yes"]

    port = ssh_cfg.get("port")
    if isinstance(port, int) and port > 0:
        prefix.extend(["-p", str(port)])
    elif isinstance(port, str) and port.strip():
        prefix.extend(["-p", port.strip()])

    identity_file = ssh_cfg.get("identity_file")
    if isinstance(identity_file, str) and identity_file.strip():
        p = os.path.expanduser(identity_file.strip())
        prefix.extend(["-i", p])

    options = ssh_cfg.get("options")
    if isinstance(options, str) and options.strip():
        options = [options.strip()]
    if isinstance(options, list):
        for opt in options:
            if isinstance(opt, str) and opt.strip():
                prefix.extend(["-o", opt.strip()])

    extra_args = ssh_cfg.get("extra_args")
    if isinstance(extra_args, list):
        for a in extra_args:
            if isinstance(a, str) and a.strip():
                prefix.append(a.strip())

    return remote, prefix


def _ssh_run(
    ssh_cfg: Mapping[str, Any],
    *,
    script: str,
    input_text: Optional[str],
    sensitive: bool,
    approve_remote: bool,
    action: str,
) -> subprocess.CompletedProcess[str]:
    require_remote_approval(approve_remote, action=action)
    remote, prefix = _ssh_remote_and_prefix(ssh_cfg)
    cmd = [*prefix, remote, "sh", "-lc", script]
    res = subprocess.run(cmd, input=input_text, text=True, capture_output=True, check=False)
    if res.returncode != 0:
        if sensitive:
            die(f"ssh command failed (exit code {res.returncode}); output suppressed for safety")
        stderr = (res.stderr or "").strip()
        stderr_excerpt = (stderr[:2000] + "…") if len(stderr) > 2000 else stderr
        detail = f": {stderr_excerpt}" if stderr_excerpt else ""
        die(f"ssh command failed (exit code {res.returncode}){detail}")
    return res


def _ssh_write_text_file(
    ssh_cfg: Mapping[str, Any],
    *,
    path: str,
    content: str,
    mode_octal: str,
    sensitive: bool,
    approve_remote: bool,
    action: str,
    tmp_dir: Optional[str] = None,
    sudo: bool = False,
) -> None:
    remote_dir = posixpath.dirname(path)
    tmp_tag = uuid.uuid4().hex[:8]
    if sudo:
        tmp_base = tmp_dir or "/tmp"
        tmp_path = posixpath.join(tmp_base, f".envctl.{tmp_tag}.tmp")
        dest_tmp = f"{path}.tmp.{tmp_tag}"
        script = "\n".join(
            [
                "set -e",
                f"tmp_dir={_sh_quote(tmp_base)}",
                "mkdir -p \"$tmp_dir\"",
                f"tmp={_sh_quote(tmp_path)}",
                "cat > \"$tmp\"",
                f"sudo -n mkdir -p {_sh_quote(remote_dir)}",
                f"sudo -n cp \"$tmp\" {_sh_quote(dest_tmp)}",
                f"sudo -n chmod {mode_octal} {_sh_quote(dest_tmp)}",
                f"sudo -n mv {_sh_quote(dest_tmp)} {_sh_quote(path)}",
                "rm -f \"$tmp\"",
            ]
        )
    else:
        tmp = f"{path}.tmp.{tmp_tag}"
        script = "\n".join(
            [
                "set -e",
                f"mkdir -p {_sh_quote(remote_dir)}",
                f"tmp={_sh_quote(tmp)}",
                "cat > \"$tmp\"",
                f"chmod {mode_octal} \"$tmp\"",
                f"mv \"$tmp\" {_sh_quote(path)}",
            ]
        )
    _ssh_run(
        ssh_cfg,
        script=script,
        input_text=content,
        sensitive=sensitive,
        approve_remote=approve_remote,
        action=action,
    )


def _run_local_commands(commands: Sequence[str], *, action: str, sensitive: bool) -> None:
    if not commands:
        return
    script = "set -e\n" + "\n".join(commands)
    res = subprocess.run(["sh", "-lc", script], text=True, capture_output=True, check=False)
    if res.returncode != 0:
        if sensitive:
            die(f"{action} failed (exit code {res.returncode}); output suppressed for safety")
        stderr = (res.stderr or "").strip()
        stderr_excerpt = (stderr[:2000] + "…") if len(stderr) > 2000 else stderr
        detail = f": {stderr_excerpt}" if stderr_excerpt else ""
        die(f"{action} failed (exit code {res.returncode}){detail}")


def _ssh_run_commands(
    ssh_cfg: Mapping[str, Any],
    commands: Sequence[str],
    *,
    approve_remote: bool,
    action: str,
    sensitive: bool,
) -> None:
    if not commands:
        return
    script = "set -e\n" + "\n".join(commands)
    _ssh_run(
        ssh_cfg,
        script=script,
        input_text=None,
        sensitive=sensitive,
        approve_remote=approve_remote,
        action=action,
    )


def _write_text_file_local(path: Path, content: str, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp.{uuid.uuid4().hex[:8]}")
    tmp.write_text(content, encoding="utf-8")
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def _http_healthcheck(url: str, timeout_ms: int) -> Tuple[bool, str]:
    deadline = time.time() + (timeout_ms / 1000.0)
    last_err = ""
    while time.time() < deadline:
        try:
            req = Request(url, headers={"User-Agent": "env-cloudctl"})
            with urlopen(req, timeout=max(1.0, timeout_ms / 1000.0)) as resp:
                status = getattr(resp, "status", None) or resp.getcode()
                if 200 <= int(status) < 400:
                    return True, f"http_status={status}"
                last_err = f"http_status={status}"
        except Exception as e:  # noqa: BLE001
            last_err = str(e)
        time.sleep(0.5)
    return False, last_err or "timeout"


def _ssh_sha256(ssh_cfg: Mapping[str, Any], *, path: str, approve_remote: bool) -> str:
    script = "\n".join(
        [
            "set -e",
            f"file={_sh_quote(path)}",
            "if command -v sha256sum >/dev/null 2>&1; then sha256sum \"$file\" | awk '{print $1}'; exit 0; fi",
            "if command -v shasum >/dev/null 2>&1; then shasum -a 256 \"$file\" | awk '{print $1}'; exit 0; fi",
            "if command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 \"$file\" | awk '{print $2}'; exit 0; fi",
            "echo 'no sha256 tool available' >&2; exit 4",
        ]
    )
    res = _ssh_run(
        ssh_cfg,
        script=script,
        input_text=None,
        sensitive=False,
        approve_remote=approve_remote,
        action="Remote hash check",
    )
    out = (res.stdout or "").strip()
    m = re.search(r"([a-fA-F0-9]{64})", out)
    if not m:
        die("Failed to parse remote sha256 output")
    return m.group(1).lower()

def apply_state_mockcloud(root: Path, desired: DesiredState) -> Dict[str, Any]:
    deployed = load_mock_deployed_state(root, desired.env)
    now = utc_now_iso()

    # Preserve existing secret versions if present.
    existing_secrets: Dict[str, Any] = {}
    if deployed and isinstance(deployed.get("secrets"), dict):
        existing_secrets = deployed["secrets"]

    secrets_with_meta: Dict[str, Any] = {}
    for name, meta in desired.secrets.items():
        prev = existing_secrets.get(name) if isinstance(existing_secrets.get(name), dict) else None
        version = 1
        rotated_at = None
        if prev:
            version = int(prev.get("version") or 1)
            rotated_at = prev.get("rotated_at")
        secrets_with_meta[name] = {
            "backend": meta.get("backend"),
            "stable_ref": meta.get("stable_ref") if meta.get("stable_ref") is not None else meta.get("ref"),
            "version": version,
            "rotated_at": rotated_at,
        }

    state = {
        "env": desired.env,
        "provider": desired.provider,
        "runtime": desired.runtime,
        "applied_at": now,
        "config": desired.config,
        "secrets": secrets_with_meta,
        "var_to_secret_ref": desired.var_to_secret_ref,
    }
    write_mock_deployed_state(root, desired.env, state)
    write_cloud_context(root, desired)
    return state


def apply_state_envfile(root: Path, desired: DesiredState, *, approve_remote: bool) -> Dict[str, Any]:
    inj = desired.envfile
    if not inj:
        die("envfile injection is missing for provider=envfile")

    bws = new_bws_cache()
    secret_values: Dict[str, str] = {}
    for secret_name, cfg in desired.secrets_cfg.items():
        secret_values[secret_name] = resolve_secret_value(
            root,
            desired.policy_env,
            env=desired.env,
            secret_name=secret_name,
            cfg=cfg,
            bws=bws,
        )

    env_kv: Dict[str, Any] = dict(desired.config)
    for var_name, secret_ref in desired.var_to_secret_ref.items():
        env_kv[var_name] = secret_values[secret_ref]

    env_text = render_env_file(
        env_kv,
        header="Generated by env-cloudctl. Do not hand-edit; regenerate via env_cloudctl.py apply",
    )
    env_bytes = env_text.encode("utf-8")
    sha256 = hashlib.sha256(env_bytes).hexdigest()
    mode_octal = format(inj.mode, "03o")

    now = utc_now_iso()
    state: Dict[str, Any] = {
        "env": desired.env,
        "provider": desired.provider,
        "runtime": desired.runtime,
        "applied_at": now,
        "target_id": desired.target.target_id,
        "transport": inj.transport,
        "env_file": {"path": inj.target_path, "sha256": sha256, "bytes": len(env_bytes)},
        "config": desired.config,
        "secrets": desired.secrets,
        "var_to_secret_ref": desired.var_to_secret_ref,
    }

    if inj.transport == "local":
        _run_local_commands(inj.pre_commands, action="Local pre-commands", sensitive=True)
        _write_text_file_local(Path(inj.target_path), env_text, inj.mode)
        _run_local_commands(inj.post_commands, action="Local post-commands", sensitive=True)
    else:
        require_remote_approval(approve_remote, action="Remote apply")
        host_labels: List[str] = []
        for ssh_cfg in inj.ssh_targets or []:
            host_labels.append(_format_ssh_target(ssh_cfg))
            _ssh_run_commands(
                ssh_cfg,
                inj.pre_commands,
                approve_remote=approve_remote,
                action="Remote pre-commands",
                sensitive=True,
            )
            _ssh_write_text_file(
                ssh_cfg,
                path=inj.target_path,
                content=env_text,
                mode_octal=mode_octal,
                sensitive=True,
                approve_remote=approve_remote,
                action="Remote env-file write",
                tmp_dir=inj.remote_tmp_dir,
                sudo=inj.sudo,
            )
            if inj.meta_path:
                _ssh_write_text_file(
                    ssh_cfg,
                    path=inj.meta_path,
                    content=json.dumps(state, indent=2, sort_keys=True) + "\n",
                    mode_octal=mode_octal,
                    sensitive=False,
                    approve_remote=approve_remote,
                    action="Remote meta write",
                    tmp_dir=inj.remote_tmp_dir,
                    sudo=inj.sudo,
                )
            _ssh_run_commands(
                ssh_cfg,
                inj.post_commands,
                approve_remote=approve_remote,
                action="Remote post-commands",
                sensitive=True,
            )
        state["hosts"] = host_labels

    if desired.target.health_url:
        ok, detail = _http_healthcheck(desired.target.health_url, desired.target.health_timeout_ms)
        if not ok:
            die(f"Healthcheck failed for {desired.target.health_url}: {detail}")

    write_cloud_context(root, desired)
    write_local_envcloud_state(root, desired.env, state)
    return state


def apply_state(root: Path, desired: DesiredState, approve: bool, approve_remote: bool) -> Dict[str, Any]:
    if not approve:
        die("Apply requires --approve")
    if desired.provider == "mockcloud":
        return apply_state_mockcloud(root, desired)
    if desired.provider == "envfile":
        return apply_state_envfile(root, desired, approve_remote=approve_remote)
    die(f"Provider {desired.provider!r} is not supported by this template implementation")
    return {}  # unreachable


def verify_state(
    root: Path,
    desired: DesiredState,
    deployed: Optional[Dict[str, Any]],
    *,
    remote: bool,
    approve_remote: bool,
) -> Tuple[bool, Dict[str, Any]]:
    plan = diff_state(desired, deployed)
    ok = plan["status"] == "NOOP"
    if desired.provider == "envfile" and desired.envfile and desired.envfile.transport == "ssh":
        if remote:
            expected_sha256 = None
            if deployed and isinstance(deployed.get("env_file"), dict):
                expected_sha256 = deployed.get("env_file", {}).get("sha256")

            results: List[Dict[str, Any]] = []
            match_all = True
            for ssh_cfg in desired.envfile.ssh_targets or []:
                actual_sha256 = _ssh_sha256(ssh_cfg, path=desired.envfile.target_path, approve_remote=approve_remote)
                match = bool(expected_sha256) and expected_sha256 == actual_sha256
                match_all = match_all and match
                results.append(
                    {
                        "host": _format_ssh_target(ssh_cfg),
                        "match": match,
                        "actual_sha256": actual_sha256,
                    }
                )
            plan["remote_hash"] = {
                "checked": True,
                "match": match_all,
                "expected_sha256": expected_sha256,
                "results": results,
            }
            ok = ok and match_all
        else:
            plan["remote_hash"] = {
                "checked": False,
                "note": "Remote hash not checked; pass --remote --approve-remote to enable.",
            }

    if desired.target.health_url:
        h_ok, detail = _http_healthcheck(desired.target.health_url, desired.target.health_timeout_ms)
        plan["healthcheck"] = {"url": desired.target.health_url, "ok": h_ok, "detail": detail}
        ok = ok and h_ok
    return ok, plan


def random_secret_value(length: int = 32) -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "".join(random.choice(alphabet) for _ in range(length))


def write_secret_file(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write atomically
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(value + "\n", encoding="utf-8")
    os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)
    tmp.replace(path)


def rotate_secret(root: Path, env: str, workload: Optional[str], secret_name: str, approve: bool) -> Dict[str, Any]:
    if not approve:
        die("Rotate requires --approve")
    desired = build_desired_state(root, env, workload)
    if desired.provider != "mockcloud":
        die(f"Provider '{desired.provider}' is not supported by this reference implementation. Implement an adapter for your provider.")

    deployed = load_mock_deployed_state(root, env)
    if deployed is None:
        die(f"No deployed state found for env '{env}'. Apply first.")

    # Ensure secret exists in desired state
    if secret_name not in desired.secrets:
        die(f"Secret '{secret_name}' not found in desired secrets for env '{env}'.")

    meta = desired.secrets[secret_name]
    backend = meta.get("backend")

    if backend != "mock":
        die(f"Rotation backend '{backend}' is not supported by this reference implementation.")

    # Update mock secret store value (never print old/new values)
    secret_path = root / "env" / ".secrets-store" / env / secret_name
    new_value = random_secret_value(40)
    write_secret_file(secret_path, new_value)

    # Update deployed state version
    if "secrets" not in deployed or not isinstance(deployed["secrets"], dict):
        deployed["secrets"] = {}

    prev = deployed["secrets"].get(secret_name)
    prev_version = 0
    if isinstance(prev, dict):
        prev_version = int(prev.get("version") or 0)

    deployed["secrets"][secret_name] = {
        "backend": meta.get("backend"),
        "stable_ref": meta.get("stable_ref") if meta.get("stable_ref") is not None else meta.get("ref"),
        "version": prev_version + 1,
        "rotated_at": utc_now_iso(),
    }

    deployed["applied_at"] = utc_now_iso()
    write_mock_deployed_state(root, env, deployed)
    write_cloud_context(root, desired)
    return deployed


def decommission_env(root: Path, desired: DesiredState, approve: bool) -> None:
    if not approve:
        die("Decommission requires --approve")
    if desired.provider != "mockcloud":
        die(f"Decommission is only supported for provider='mockcloud' in this template (got {desired.provider!r})")

    # Only decommission mock state in this reference implementation.
    sdir = mock_state_dir(root, desired.env)
    if not sdir.exists():
        # idempotent
        return
    shutil.rmtree(sdir)


def render_verify_md(ok: bool, plan: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Cloud Environment Verify")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{utc_now_iso()}`")
    lines.append(f"- Status: **{'PASS' if ok else 'FAIL'}**")
    lines.append("")
    lines.append("## Diff (redacted)")
    lines.append("```json")
    lines.append(json.dumps(plan, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Secret values are never included.")
    if isinstance(plan.get("remote_hash"), dict) and not plan["remote_hash"].get("checked"):
        lines.append("- Remote hash not checked; pass `--remote --approve-remote` to enable.")
    return "\n".join(lines) + "\n"


def render_rotate_md(env: str, secret: str, deployed: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Secret Rotation Log")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{utc_now_iso()}`")
    lines.append(f"- Env: `{env}`")
    lines.append(f"- Secret: `{secret}`")

    # Do not print secret value.
    meta = None
    if isinstance(deployed.get("secrets"), dict):
        meta = deployed["secrets"].get(secret)
    if isinstance(meta, dict):
        lines.append(f"- New version: `{meta.get('version')}`")
        lines.append(f"- Rotated at: `{meta.get('rotated_at')}`")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Secret value was updated in the backend; not displayed here.")
    return "\n".join(lines) + "\n"


def render_apply_md(state: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Cloud Apply Execution Log")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{utc_now_iso()}`")
    lines.append(f"- Env: `{state.get('env')}`")
    lines.append(f"- Provider: `{state.get('provider')}`")
    lines.append(f"- Applied at: `{state.get('applied_at')}`")
    lines.append("")
    lines.append("## Deployed state (redacted)")
    lines.append("```json")
    lines.append(json.dumps(state, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- This log intentionally excludes secret values.")
    return "\n".join(lines) + "\n"


def write_output(path: Optional[str], content: str) -> None:
    if path:
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content, encoding="utf-8")
    else:
        sys.stdout.write(content)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Cloud environment controller (policy-driven targets).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--root", default=".", help="Project root")
        p.add_argument("--env", required=True, help="Environment name")
        p.add_argument("--workload", default=None, help="Optional workload selector (e.g. api, worker, iac)")
        p.add_argument("--out", default=None, help="Write markdown report to this path")

    def add_remote_flags(p: argparse.ArgumentParser, *, include_remote: bool) -> None:
        if include_remote:
            p.add_argument("--remote", action="store_true", help="Read/verify deployed state from remote host (ssh transport only)")
        p.add_argument("--approve-remote", action="store_true", help="Explicit approval for remote commands (ssh transport)")

    p_plan = sub.add_parser("plan", help="Plan changes (diff)")
    add_common(p_plan)
    add_remote_flags(p_plan, include_remote=True)

    p_drift = sub.add_parser("drift", help="Detect drift (alias of plan)")
    add_common(p_drift)
    add_remote_flags(p_drift, include_remote=True)

    p_apply = sub.add_parser("apply", help="Apply desired config to provider")
    add_common(p_apply)
    p_apply.add_argument("--approve", action="store_true", help="Explicit approval gate")
    add_remote_flags(p_apply, include_remote=False)

    p_verify = sub.add_parser("verify", help="Verify desired == deployed")
    add_common(p_verify)
    add_remote_flags(p_verify, include_remote=True)

    p_rotate = sub.add_parser("rotate", help="Rotate a secret (backend-dependent)")
    add_common(p_rotate)
    p_rotate.add_argument("--secret", required=True, help="Secret ref name to rotate")
    p_rotate.add_argument("--approve", action="store_true", help="Explicit approval gate")

    p_decom = sub.add_parser("decommission", help="Decommission an environment")
    add_common(p_decom)
    p_decom.add_argument("--approve", action="store_true", help="Explicit approval gate")

    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    env = str(args.env)
    workload = str(args.workload).strip() if args.workload is not None and str(args.workload).strip() else None

    if args.cmd in {"plan", "drift"}:
        desired = build_desired_state(root, env, workload)
        deployed = load_deployed_state_for_desired(root, desired, remote=bool(getattr(args, "remote", False)), approve_remote=bool(getattr(args, "approve_remote", False)))
        plan = diff_state(desired, deployed)
        if desired.provider == "envfile" and desired.envfile and desired.envfile.transport == "ssh":
            plan["remote_checked"] = bool(getattr(args, "remote", False))
            if not plan["remote_checked"]:
                plan["note"] = "Remote deployed state not read. Pass --remote --approve-remote to enable."
        write_cloud_context(root, desired)
        write_output(args.out, render_plan_md(desired, deployed, plan))
        return 0

    if args.cmd == "apply":
        desired = build_desired_state(root, env, workload)
        state = apply_state(root, desired, approve=bool(args.approve), approve_remote=bool(getattr(args, "approve_remote", False)))
        write_output(args.out, render_apply_md(state))
        return 0

    if args.cmd == "verify":
        desired = build_desired_state(root, env, workload)
        deployed = load_deployed_state_for_desired(root, desired, remote=bool(getattr(args, "remote", False)), approve_remote=bool(getattr(args, "approve_remote", False)))
        ok, plan = verify_state(
            root,
            desired,
            deployed,
            remote=bool(getattr(args, "remote", False)),
            approve_remote=bool(getattr(args, "approve_remote", False)),
        )
        write_output(args.out, render_verify_md(ok, plan))
        return 0 if ok else 1

    if args.cmd == "rotate":
        deployed = rotate_secret(root, env, workload, str(args.secret), approve=bool(args.approve))
        write_output(args.out, render_rotate_md(env, str(args.secret), deployed))
        return 0

    if args.cmd == "decommission":
        desired = build_desired_state(root, env, workload)
        decommission_env(root, desired, approve=bool(args.approve))
        write_output(args.out, f"# Decommission\n\n- Timestamp (UTC): `{utc_now_iso()}`\n- Env: `{env}`\n- Status: **PASS**\n")
        return 0

    die(f"Unknown command: {args.cmd}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
