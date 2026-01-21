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

Exit codes:
  - 0: success
  - 1: failure
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import shutil
import socket
import stat
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

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
    secrets = data.get("secrets")
    if secrets is None:
        # allow legacy: top-level mapping
        secrets = {k: v for k, v in data.items() if k != "version"}
    if not isinstance(secrets, dict):
        die(f"Secrets ref file must have 'secrets' mapping: {ref_path}")

    out: Dict[str, Dict[str, Any]] = {}
    for name, meta in secrets.items():
        if not isinstance(name, str):
            continue
        if not isinstance(meta, dict):
            die(f"Secret ref '{name}' must be a mapping in {ref_path}")
        backend = str(meta.get("backend") or "").strip()
        ref = str(meta.get("ref") or "").strip()
        if not backend or not ref:
            die(f"Secret ref '{name}' must specify backend and ref in {ref_path}")
        out[name] = {"backend": backend, "ref": ref, **{k: v for k, v in meta.items() if k not in {"backend", "ref"}}}

    return out


def load_inventory(root: Path, env: str) -> Dict[str, Any]:
    inv_path = root / "env" / "inventory" / f"{env}.yaml"
    if not inv_path.exists():
        die(f"Missing inventory file: {inv_path}")
    data = load_yaml(inv_path)
    if not isinstance(data, dict):
        die(f"Inventory file must be a mapping: {inv_path}")
    # Minimal required field
    provider = data.get("provider")
    if not isinstance(provider, str) or not provider.strip():
        die(f"Inventory must include a provider string: {inv_path}")
    return data


@dataclass
class DesiredState:
    env: str
    provider: str
    runtime: Optional[str]
    config: Dict[str, Any]  # non-secret values
    secrets: Dict[str, Dict[str, Any]]  # secret refs only
    var_to_secret_ref: Dict[str, str]  # variable name -> secret_ref
    warnings: List[str]  # non-fatal issues (e.g., deprecated/legacy keys)


def build_desired_state(root: Path, env: str) -> DesiredState:
    ensure_ssot_mode(root)
    contract_vars, _contract_envs = parse_contract(root)
    inv = load_inventory(root, env)

    values = load_values(root, env)
    secrets_ref = load_secrets_ref(root, env)

    values_path = root / "env" / "values" / f"{env}.yaml"

    provider = str(inv.get("provider"))
    runtime = inv.get("runtime")
    runtime = str(runtime) if runtime is not None else None

    config: Dict[str, Any] = {}
    secrets: Dict[str, Dict[str, Any]] = {}
    var_to_secret: Dict[str, str] = {}
    warnings: List[str] = []

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
            secrets[ref_name] = {"backend": secrets_ref[ref_name]["backend"], "ref": secrets_ref[ref_name]["ref"]}
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

    return DesiredState(
        env=env,
        provider=provider,
        runtime=runtime,
        config=config,
        secrets=secrets,
        var_to_secret_ref=var_to_secret,
        warnings=warnings,
    )


def state_dir(root: Path, env: str) -> Path:
    return root / ".ai" / "mock-cloud" / env


def load_deployed_state(root: Path, env: str) -> Optional[Dict[str, Any]]:
    sdir = state_dir(root, env)
    path = sdir / "state.json"
    if not path.exists():
        return None
    return load_json(path)


def write_deployed_state(root: Path, env: str, state: Dict[str, Any]) -> None:
    sdir = state_dir(root, env)
    sdir.mkdir(parents=True, exist_ok=True)
    path = sdir / "state.json"
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


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
            normalized_old_sec[k] = {"backend": v.get("backend"), "ref": v.get("ref")
            }
        else:
            normalized_old_sec[k] = v

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


def apply_state(root: Path, env: str, desired: DesiredState, approve: bool) -> Dict[str, Any]:
    if not approve:
        die("Apply requires --approve")
    if desired.provider != "mockcloud":
        die(f"Provider '{desired.provider}' is not supported by this reference implementation. Implement an adapter for your provider.")

    deployed = load_deployed_state(root, env)
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
            "ref": meta.get("ref"),
            "version": version,
            "rotated_at": rotated_at,
        }

    state = {
        "env": env,
        "provider": desired.provider,
        "runtime": desired.runtime,
        "applied_at": now,
        "config": desired.config,
        "secrets": secrets_with_meta,
        "var_to_secret_ref": desired.var_to_secret_ref,
    }
    write_deployed_state(root, env, state)
    write_cloud_context(root, desired)
    return state


def verify_state(root: Path, desired: DesiredState, deployed: Optional[Dict[str, Any]]) -> Tuple[bool, Dict[str, Any]]:
    plan = diff_state(desired, deployed)
    ok = plan["status"] == "NOOP"
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


def rotate_secret(root: Path, env: str, secret_name: str, approve: bool) -> Dict[str, Any]:
    if not approve:
        die("Rotate requires --approve")
    desired = build_desired_state(root, env)
    if desired.provider != "mockcloud":
        die(f"Provider '{desired.provider}' is not supported by this reference implementation. Implement an adapter for your provider.")

    deployed = load_deployed_state(root, env)
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
        "ref": meta.get("ref"),
        "version": prev_version + 1,
        "rotated_at": utc_now_iso(),
    }

    deployed["applied_at"] = utc_now_iso()
    write_deployed_state(root, env, deployed)
    write_cloud_context(root, desired)
    return deployed


def decommission_env(root: Path, env: str, approve: bool) -> None:
    if not approve:
        die("Decommission requires --approve")

    # Only decommission mock state in this reference implementation.
    sdir = state_dir(root, env)
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
    parser = argparse.ArgumentParser(description="Cloud environment controller (mockcloud reference).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--root", default=".", help="Project root")
        p.add_argument("--env", required=True, help="Environment name")
        p.add_argument("--out", default=None, help="Write markdown report to this path")

    p_plan = sub.add_parser("plan", help="Plan changes (diff)")
    add_common(p_plan)

    p_drift = sub.add_parser("drift", help="Detect drift (alias of plan)")
    add_common(p_drift)

    p_apply = sub.add_parser("apply", help="Apply desired config to provider")
    add_common(p_apply)
    p_apply.add_argument("--approve", action="store_true", help="Explicit approval gate")

    p_verify = sub.add_parser("verify", help="Verify desired == deployed")
    add_common(p_verify)

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

    if args.cmd in {"plan", "drift"}:
        desired = build_desired_state(root, env)
        deployed = load_deployed_state(root, env)
        plan = diff_state(desired, deployed)
        write_cloud_context(root, desired)
        write_output(args.out, render_plan_md(desired, deployed, plan))
        return 0

    if args.cmd == "apply":
        desired = build_desired_state(root, env)
        state = apply_state(root, env, desired, approve=bool(args.approve))
        write_output(args.out, render_apply_md(state))
        return 0

    if args.cmd == "verify":
        desired = build_desired_state(root, env)
        deployed = load_deployed_state(root, env)
        ok, plan = verify_state(root, desired, deployed)
        write_output(args.out, render_verify_md(ok, plan))
        return 0 if ok else 1

    if args.cmd == "rotate":
        deployed = rotate_secret(root, env, str(args.secret), approve=bool(args.approve))
        write_output(args.out, render_rotate_md(env, str(args.secret), deployed))
        return 0

    if args.cmd == "decommission":
        decommission_env(root, env, approve=bool(args.approve))
        write_output(args.out, f"# Decommission\n\n- Timestamp (UTC): `{utc_now_iso()}`\n- Env: `{env}`\n- Status: **PASS**\n")
        return 0

    die(f"Unknown command: {args.cmd}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
