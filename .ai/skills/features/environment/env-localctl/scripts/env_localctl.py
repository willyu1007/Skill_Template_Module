#!/usr/bin/env python3
"""Local environment controller under repo-env-contract.

Subcommands:
  - doctor: validate required files and required keys for an env; check secret material resolvability.
  - compile: resolve secrets and generate `.env.local` (or `.env.<env>.local`) and redacted effective context JSON.
  - connectivity: best-effort parse/TCP checks for configured URL endpoints (redacted output).

Design goals:
  - Never print secret values.
  - Write secret values only to gitignored local env files.
  - Produce actionable markdown reports.

Exit codes:
  - 0: success
  - 1: failure
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import stat
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import urlparse

import yaml_min

ALLOWED_TYPES = {"string", "int", "float", "bool", "json", "enum", "url"}
LIFECYCLE_STATES = {"active", "deprecated", "removed"}
_DATE_YYYY_MM_DD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ENV_VAR_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_yaml(path: Path) -> Any:
    return yaml_min.safe_load(read_text(path))


def load_json(path: Path) -> Any:
    return json.loads(read_text(path))


def get_ssot_mode(root: Path) -> Optional[str]:
    gate = root / "docs" / "project" / "env-ssot.json"
    if not gate.exists():
        return None
    try:
        data = load_json(gate)
    except Exception:
        return None
    if isinstance(data, dict):
        for k in ("mode", "env_ssot", "ssot_mode"):
            if k in data and isinstance(data[k], str):
                return data[k]
    return None


@dataclass
class VarDef:
    name: str
    type: str
    required: bool
    secret: bool
    secret_ref: Optional[str]
    default: Any
    enum: Optional[List[str]]
    scopes: Optional[List[str]]
    description: str
    state: str  # active|deprecated|removed
    deprecate_after: Optional[str]
    replacement: Optional[str]
    rename_from: Optional[str]


def parse_contract(root: Path) -> Tuple[Dict[str, VarDef], List[str]]:
    """Return (vars, errors)."""
    errors: List[str] = []
    contract_path = root / "env" / "contract.yaml"
    if not contract_path.exists():
        return {}, [f"Missing contract: {contract_path}"]

    try:
        doc = load_yaml(contract_path)
    except Exception as e:
        return {}, [f"Failed to parse contract YAML: {e}"]

    if not isinstance(doc, dict) or "variables" not in doc or not isinstance(doc.get("variables"), dict):
        return {}, ["Contract must be a mapping with top-level 'variables' mapping."]

    raw_vars: Mapping[str, Any] = doc["variables"]
    vars_out: Dict[str, VarDef] = {}

    for name, cfg in raw_vars.items():
        if not isinstance(name, str) or not ENV_VAR_RE.match(name):
            errors.append(f"Invalid env var name in contract: {name!r}")
            continue
        if not isinstance(cfg, dict):
            errors.append(f"Variable {name}: definition must be a mapping")
            continue

        vtype = cfg.get("type")
        if not isinstance(vtype, str) or vtype not in ALLOWED_TYPES:
            errors.append(f"Variable {name}: invalid type {vtype!r} (allowed: {sorted(ALLOWED_TYPES)})")
            continue

        # Lifecycle (backward compatible):
        # - preferred: state: active|deprecated|removed
        # - legacy: deprecated: true
        state_raw = cfg.get("state")
        deprecated_raw = cfg.get("deprecated")
        state: str
        if isinstance(state_raw, str) and state_raw.strip():
            state = state_raw.strip()
        elif deprecated_raw is True:
            state = "deprecated"
        else:
            state = "active"
        if state not in LIFECYCLE_STATES:
            errors.append(f"Variable {name}: invalid state {state!r} (allowed: {sorted(LIFECYCLE_STATES)})")
            state = "active"
        if deprecated_raw is True and state != "deprecated":
            errors.append(f"Variable {name}: deprecated=true conflicts with state={state!r}")

        deprecate_after = cfg.get("deprecate_after")
        if deprecate_after is not None:
            if not isinstance(deprecate_after, str) or not _DATE_YYYY_MM_DD_RE.match(deprecate_after.strip()):
                errors.append(f"Variable {name}: deprecate_after must be YYYY-MM-DD if present")
                deprecate_after = None
            else:
                deprecate_after = deprecate_after.strip()
            if state != "deprecated":
                errors.append(f"Variable {name}: deprecate_after is only valid when state='deprecated'")
                deprecate_after = None

        replacement = cfg.get("replacement")
        replaced_by = cfg.get("replaced_by")
        if replacement is None and replaced_by is not None:
            replacement = replaced_by
        if replacement is not None:
            if not isinstance(replacement, str) or not ENV_VAR_RE.match(replacement):
                errors.append(f"Variable {name}: replacement must be a valid env var name")
                replacement = None
            if state != "deprecated":
                errors.append(f"Variable {name}: replacement is only valid when state='deprecated'")
                replacement = None

        rename_from: Optional[str] = None
        migration = cfg.get("migration")
        if migration is not None:
            if not isinstance(migration, dict):
                errors.append(f"Variable {name}: migration must be a mapping if present")
            else:
                rf = migration.get("rename_from")
                if rf is not None:
                    if not isinstance(rf, str) or not ENV_VAR_RE.match(rf):
                        errors.append(f"Variable {name}: migration.rename_from must be a valid env var name")
                    elif rf == name:
                        errors.append(f"Variable {name}: migration.rename_from must not equal the variable name")
                    else:
                        rename_from = rf

        required = bool(cfg.get("required", False))
        secret = bool(cfg.get("secret", False))
        secret_ref = cfg.get("secret_ref")
        if secret:
            if not isinstance(secret_ref, str) or not secret_ref.strip():
                errors.append(f"Variable {name}: secret variables must set non-empty secret_ref")
            if "default" in cfg:
                errors.append(f"Variable {name}: secret variables must not define a default")
        else:
            if secret_ref is not None:
                # Allow but warn-like error? We'll treat as error to keep contract clean.
                errors.append(f"Variable {name}: non-secret variables must not set secret_ref")

        default = cfg.get("default")
        enum_vals = cfg.get("enum")
        enum_list: Optional[List[str]] = None
        if vtype == "enum":
            if not isinstance(enum_vals, list) or not enum_vals or not all(isinstance(x, str) for x in enum_vals):
                errors.append(f"Variable {name}: enum type requires non-empty string list 'enum'")
            else:
                enum_list = list(enum_vals)

        scopes_vals = cfg.get("scopes")
        scopes: Optional[List[str]] = None
        if scopes_vals is not None:
            if not isinstance(scopes_vals, list) or not all(isinstance(x, str) for x in scopes_vals):
                errors.append(f"Variable {name}: scopes must be a list of env names")
            else:
                scopes = list(scopes_vals)

        description = cfg.get("description")
        if not isinstance(description, str) or not description.strip() or "\n" in description:
            errors.append(f"Variable {name}: description must be a non-empty single line")
            description = (description or "").replace("\n", " ").strip()

        vars_out[name] = VarDef(
            name=name,
            type=vtype,
            required=required,
            secret=secret,
            secret_ref=secret_ref if isinstance(secret_ref, str) else None,
            default=default,
            enum=enum_list,
            scopes=scopes,
            description=description,
            state=state,
            deprecate_after=deprecate_after if isinstance(deprecate_after, str) else None,
            replacement=replacement if isinstance(replacement, str) else None,
            rename_from=rename_from,
        )

    # Validate rename_from mapping collisions / conflicts.
    rename_from_to: Dict[str, str] = {}
    for new_name, vdef in vars_out.items():
        if not vdef.rename_from:
            continue
        old = vdef.rename_from
        if old in rename_from_to and rename_from_to[old] != new_name:
            errors.append(f"Contract rename_from collision: {old} -> {rename_from_to[old]} and {new_name}")
        else:
            rename_from_to[old] = new_name

    for old, new in rename_from_to.items():
        old_def = vars_out.get(old)
        if old_def and old_def.state != "removed":
            errors.append(f"Contract rename_from conflict: {new} declares rename_from={old} but {old} exists and is not state='removed'")

    return vars_out, errors


def _rename_from_map(vars_def: Mapping[str, VarDef]) -> Dict[str, str]:
    return {v.rename_from: v.name for v in vars_def.values() if v.rename_from}


def canonicalize_values_for_env(
    vars_def: Mapping[str, VarDef],
    raw_values: Mapping[str, Any],
    *,
    env: str,
    source_path: Path,
) -> Tuple[Dict[str, Any], List[str], List[str]]:
    """Canonicalize values file keys using contract migration.rename_from.

    Returns (canonical_values, errors, warnings).
    """
    errors: List[str] = []
    warnings: List[str] = []
    out: Dict[str, Any] = {}

    rename_map = _rename_from_map(vars_def)

    for k, v in raw_values.items():
        if k in vars_def:
            vdef = vars_def[k]
            if not applicable(vdef, env):
                errors.append(f"Out-of-scope key in values file {source_path}: {k} (env={env})")
                continue
            if vdef.state == "removed":
                errors.append(f"Removed contract key set in values file {source_path}: {k}")
                continue
            if vdef.secret:
                errors.append(f"Values file must not include secret variable {k}: {source_path}")
                continue
            if vdef.state == "deprecated":
                msg = f"Deprecated contract key used in values file {source_path}: {k}"
                if vdef.deprecate_after:
                    msg += f" (deprecate_after={vdef.deprecate_after})"
                if vdef.replacement:
                    msg += f" (replacement={vdef.replacement})"
                warnings.append(msg)
            out[k] = v
            continue

        if k in rename_map:
            new_key = rename_map[k]
            if new_key in raw_values:
                errors.append(
                    f"Conflicting keys in values file {source_path}: both legacy {k} and new {new_key} are set. Remove {k}."
                )
                continue
            vdef = vars_def.get(new_key)
            if vdef is None:
                errors.append(f"Legacy key {k} maps to unknown contract key {new_key}: {source_path}")
                continue
            if not applicable(vdef, env):
                errors.append(f"Out-of-scope key in values file {source_path}: {k} -> {new_key} (env={env})")
                continue
            if vdef.state == "removed":
                errors.append(f"Legacy key {k} maps to removed contract key {new_key}: {source_path}")
                continue
            if vdef.secret:
                errors.append(f"Values file must not include secret variable {k} (renamed to {new_key}): {source_path}")
                continue
            warnings.append(f"Legacy key used in values file {source_path}: {k} -> {new_key} (migration.rename_from).")
            out[new_key] = v
            continue

        errors.append(f"Unknown key in values file {source_path}: {k}")

    return out, errors, warnings


def discover_envs(root: Path) -> List[str]:
    envs: set[str] = set()
    values_dir = root / "env" / "values"
    if values_dir.exists():
        for p in values_dir.glob("*.yaml"):
            envs.add(p.stem)
    secrets_dir = root / "env" / "secrets"
    if secrets_dir.exists():
        for p in secrets_dir.glob("*.ref.yaml"):
            envs.add(p.name.replace(".ref.yaml", ""))
    inventory_dir = root / "env" / "inventory"
    if inventory_dir.exists():
        for p in inventory_dir.glob("*.yaml"):
            envs.add(p.stem)
    return sorted(envs)


def load_values_file(path: Path) -> Tuple[Dict[str, Any], List[str]]:
    if not path.exists():
        return {}, []
    try:
        data = load_yaml(path)
    except Exception as e:
        return {}, [f"Failed to parse values file {path}: {e}"]
    if data is None:
        return {}, []
    if not isinstance(data, dict):
        return {}, [f"Values file {path} must be a mapping"]
    out: Dict[str, Any] = {}
    errors: List[str] = []
    for k, v in data.items():
        if not isinstance(k, str) or not ENV_VAR_RE.match(k):
            errors.append(f"Invalid key in values file {path}: {k!r}")
            continue
        out[k] = v
    return out, errors


def load_secrets_ref(path: Path) -> Tuple[Dict[str, Dict[str, Any]], List[str]]:
    if not path.exists():
        return {}, [f"Missing secret ref file: {path}"]
    try:
        data = load_yaml(path)
    except Exception as e:
        return {}, [f"Failed to parse secrets ref {path}: {e}"]

    if data is None:
        return {}, [f"Secrets ref {path} is empty"]

    # Preferred format: {version: 1, secrets: {name: {backend, ref, ...}}}
    if isinstance(data, dict) and "secrets" in data and isinstance(data["secrets"], dict):
        secrets = data["secrets"]
    elif isinstance(data, dict):
        # Back-compat: allow top-level mapping of secrets (ignore metadata keys like version)
        secrets = {k: v for k, v in data.items() if k not in {"version"}}
    else:
        return {}, [f"Secrets ref {path} must be a mapping"]

    out: Dict[str, Dict[str, Any]] = {}
    errors: List[str] = []
    for name, cfg in secrets.items():
        if not isinstance(name, str) or not name.strip():
            errors.append(f"Invalid secret name in {path}: {name!r}")
            continue
        if not isinstance(cfg, dict):
            errors.append(f"Secret {name} in {path}: definition must be a mapping")
            continue
        backend = cfg.get("backend")
        ref = cfg.get("ref")
        if not isinstance(backend, str) or not backend.strip():
            errors.append(f"Secret {name} in {path}: backend must be a non-empty string")
        if not isinstance(ref, str) or not ref.strip():
            errors.append(f"Secret {name} in {path}: ref must be a non-empty string")
        out[name] = cfg
    return out, errors


def applicable(v: VarDef, env: str) -> bool:
    return v.scopes is None or env in v.scopes


def type_check_value(v: VarDef, value: Any) -> Optional[str]:
    t = v.type
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
        if v.enum and value not in v.enum:
            return f"expected one of {v.enum}"
        return None
    return None


def resolve_secret(root: Path, env: str, secret_name: str, secret_cfg: Mapping[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """Return (value, error). Never print value elsewhere."""
    backend = str(secret_cfg.get("backend", "")).strip()
    ref = str(secret_cfg.get("ref", "")).strip()

    if backend == "mock":
        # Read from env/.secrets-store/<env>/<name>
        store_path = root / "env" / ".secrets-store" / env / secret_name
        if not store_path.exists():
            return None, f"mock secret missing: create {store_path}"
        val = read_text(store_path)
        # Allow multiline but strip trailing newlines to keep .env stable.
        return val.rstrip("\n"), None

    if backend == "env":
        # Supported ref forms: env://VAR or env:VAR
        var = ref
        if ref.startswith("env://"):
            var = ref[len("env://") :]
        elif ref.startswith("env:"):
            var = ref[len("env:") :]
        var = var.strip()
        if not var:
            return None, f"env backend requires ref like env://VAR_NAME (got {ref!r})"
        val = os.getenv(var)
        if val is None:
            return None, f"missing environment variable for secret backend env: {var}"
        return val, None

    if backend == "file":
        # Supported ref forms: file:///abs/path or file:relative/path
        p = ref
        if ref.startswith("file://"):
            p = ref[len("file://") :]
        elif ref.startswith("file:"):
            p = ref[len("file:") :]
        p = p.strip()
        if not p:
            return None, f"file backend requires ref like file:///abs/path (got {ref!r})"
        path = Path(p)
        if not path.is_absolute():
            path = (root / path).resolve()
        if not path.exists():
            return None, f"file secret missing: {path}"
        val = read_text(path)
        return val.rstrip("\n"), None

    return None, f"unsupported secret backend: {backend!r} (supported: mock, env, file)"


def redact_effective(vars_def: Mapping[str, VarDef], effective: Mapping[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in effective.items():
        var_def = vars_def.get(k)
        if var_def and var_def.secret:
            out[k] = "***REDACTED***"
        else:
            out[k] = v
    return out


def envfile_name_for(env: str) -> str:
    return ".env.local" if env == "dev" else f".env.{env}.local"


def write_env_file(path: Path, kv: Mapping[str, Any]) -> None:
    lines: List[str] = []
    lines.append("# Generated by env-localctl. Do not hand-edit; regenerate via env_localctl.py compile")
    lines.append(f"# Generated at: {utc_now_iso()}")
    lines.append("")
    for k in sorted(kv.keys()):
        v = kv[k]
        # Render scalars.
        if isinstance(v, bool):
            s = "true" if v else "false"
        elif v is None:
            s = ""
        elif isinstance(v, (dict, list)):
            s = json.dumps(v, separators=(",", ":"), ensure_ascii=False)
        else:
            s = str(v)
        lines.append(f"{k}={s}")
    content = "\n".join(lines) + "\n"

    path.write_text(content, encoding="utf-8")

    # chmod 600
    try:
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        # Best-effort; may fail on some FS.
        pass


def tcp_check(host: str, port: int, timeout_s: float) -> Tuple[bool, str]:
    start = time.time()
    try:
        sock = socket.create_connection((host, port), timeout=timeout_s)
        sock.close()
        ms = int((time.time() - start) * 1000)
        return True, f"reachable ({ms}ms)"
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def connectivity_report(vars_def: Mapping[str, VarDef], effective: Mapping[str, Any], env: str) -> Dict[str, Any]:
    results: Dict[str, Any] = {"env": env, "timestamp_utc": utc_now_iso(), "checks": []}

    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.type != "url":
            continue
        if name not in effective:
            continue
        value = effective[name]
        if not isinstance(value, str) or not value:
            continue

        parsed = urlparse(value)
        entry: Dict[str, Any] = {
            "var": name,
            "scheme": parsed.scheme,
            "secret": vdef.secret,
            "status": "UNKNOWN",
            "details": {},
        }

        if parsed.scheme.startswith("sqlite"):
            # sqlite:////abs/path or sqlite:///relative
            path = parsed.path
            # Normalize similar to the db skill.
            if path.startswith("//"):
                path = path[1:]
            elif path.startswith("/"):
                path = path[1:]
            if not path:
                entry["status"] = "FAIL"
                entry["details"] = {"error": "sqlite URL missing path"}
            else:
                fpath = Path("/" + path) if parsed.path.startswith("//") else Path(path)
                if not fpath.is_absolute():
                    fpath = (Path.cwd() / fpath).resolve()
                entry["status"] = "PASS" if fpath.exists() else "FAIL"
                entry["details"] = {"path": str(fpath), "exists": fpath.exists()}
            results["checks"].append(entry)
            continue

        # Network-style URLs: best-effort TCP check if host/port present.
        host = parsed.hostname
        port = parsed.port
        if host and port:
            ok, msg = tcp_check(host, int(port), timeout_s=1.5)
            entry["status"] = "PASS" if ok else "FAIL"
            entry["details"] = {"host": host, "port": int(port), "result": msg}
        else:
            entry["status"] = "SKIP"
            entry["details"] = {"note": "No host/port to TCP-check; parsed only."}

        results["checks"].append(entry)

    return results


def render_markdown_doctor(summary: Mapping[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Local Environment Doctor")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{summary.get('timestamp_utc')}`")
    lines.append(f"- Env: `{summary.get('env')}`")
    lines.append(f"- Status: **{summary.get('status')}**")
    lines.append("")

    if summary.get("errors"):
        lines.append("## Errors")
        for e in summary["errors"]:
            lines.append(f"- {e}")
        lines.append("")

    if summary.get("warnings"):
        lines.append("## Warnings")
        for w in summary["warnings"]:
            lines.append(f"- {w}")
        lines.append("")

    if summary.get("actions"):
        lines.append("## Next actions (minimal entry points)")
        for a in summary["actions"]:
            lines.append(f"- {a}")
        lines.append("")

    lines.append("## Details (redacted)")
    lines.append("```json")
    lines.append(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Do not paste secret values into chat.")
    lines.append("- Evidence files must not include secret values.")
    return "\n".join(lines) + "\n"


def render_markdown_compile(report: Mapping[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Local Environment Compile Report")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{report.get('timestamp_utc')}`")
    lines.append(f"- Env: `{report.get('env')}`")
    lines.append(f"- Status: **{report.get('status')}**")
    lines.append(f"- Env file: `{report.get('env_file')}`")
    lines.append(f"- Effective context: `{report.get('effective_context')}`")
    lines.append("")

    missing = list(report.get("missing") or [])
    errors = list(report.get("errors") or [])
    warnings = list(report.get("warnings") or [])
    missing_set = set(missing)
    extra_errors = [e for e in errors if e not in missing_set]

    if extra_errors:
        lines.append("## Errors")
        for e in extra_errors:
            lines.append(f"- {e}")
        lines.append("")

    if missing:
        lines.append("## Missing requirements")
        for k in missing:
            lines.append(f"- {k}")
        lines.append("")

    if warnings:
        lines.append("## Warnings")
        for w in warnings:
            lines.append(f"- {w}")
        lines.append("")

    lines.append("## Key summary (redacted)")
    lines.append("```json")
    lines.append(json.dumps(report.get("keys"), indent=2, sort_keys=True, ensure_ascii=False))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Secret values are written only to the local env file.")
    lines.append("- Do not commit the local env file.")
    return "\n".join(lines) + "\n"


def ensure_dirs(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def cmd_doctor(root: Path, env: str, out: Optional[Path]) -> int:
    ts = utc_now_iso()

    mode = get_ssot_mode(root)
    errors: List[str] = []
    warnings: List[str] = []
    actions: List[str] = []

    if mode != "repo-env-contract":
        errors.append("SSOT mode gate failed: docs/project/env-ssot.json must set mode=repo-env-contract")

    vars_def, contract_errors = parse_contract(root)
    errors.extend(contract_errors)

    values_path = root / "env" / "values" / f"{env}.yaml"
    local_values_path = root / "env" / "values" / f"{env}.local.yaml"
    values, v_err = load_values_file(values_path)
    local_values, lv_err = load_values_file(local_values_path)
    errors.extend(v_err)
    errors.extend(lv_err)

    values, v_err2, v_warn2 = canonicalize_values_for_env(vars_def, values, env=env, source_path=values_path)
    local_values, lv_err2, lv_warn2 = canonicalize_values_for_env(vars_def, local_values, env=env, source_path=local_values_path)
    errors.extend(v_err2)
    errors.extend(lv_err2)
    warnings.extend(v_warn2)
    warnings.extend(lv_warn2)

    secrets_ref, s_err = load_secrets_ref(root / "env" / "secrets" / f"{env}.ref.yaml")
    errors.extend(s_err)

    missing_required: List[str] = []

    # Build a partial effective map without materializing secrets.
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue

        if vdef.secret:
            # Need a ref and resolvable secret material.
            if not vdef.secret_ref:
                missing_required.append(f"{name} (secret_ref missing in contract)")
                continue
            ref_cfg = secrets_ref.get(vdef.secret_ref)
            if ref_cfg is None:
                missing_required.append(f"{name} (missing secret ref entry: {vdef.secret_ref} in env/secrets/{env}.ref.yaml)")
                continue
            # Try resolve but do not store in report.
            _val, err = resolve_secret(root, env, vdef.secret_ref, ref_cfg)
            if err:
                missing_required.append(f"{name} (secret material unavailable: {err})")
            continue

        # Non-secret: default or value.
        value: Any
        if name in local_values:
            value = local_values[name]
        elif name in values:
            value = values[name]
        else:
            value = vdef.default

        if vdef.required and (value is None or value == ""):
            missing_required.append(f"{name} (required; provide in env/values/{env}.yaml or env/values/{env}.local.yaml or contract default)")
            continue

        if value is not None:
            err = type_check_value(vdef, value)
            if err:
                errors.append(f"Type check failed for {name}: {err}")

    if missing_required:
        errors.extend(missing_required)

    # Minimal action pointers.
    if any("env/values" in e for e in missing_required):
        actions.append(f"Add missing non-secret values to env/values/{env}.local.yaml (developer-specific) or env/values/{env}.yaml (project-wide).")
    if any("secret" in e for e in missing_required):
        actions.append(f"Ensure env/secrets/{env}.ref.yaml contains the referenced secrets and provide secret material via approved backend (never via chat).")
        actions.append(f"For mock backend: create files under env/.secrets-store/{env}/<secret_name>.")

    status = "PASS" if not errors else "FAIL"
    summary = {
        "timestamp_utc": ts,
        "env": env,
        "status": status,
        "errors": errors,
        "warnings": warnings,
        "actions": actions,
    }

    md = render_markdown_doctor(summary)
    if out:
        ensure_dirs(out)
        out.write_text(md, encoding="utf-8")
    else:
        print(md)

    return 0 if status == "PASS" else 1


def cmd_compile(root: Path, env: str, out: Optional[Path], no_write: bool = False) -> int:
    ts = utc_now_iso()
    errors: List[str] = []
    missing: List[str] = []
    warnings: List[str] = []

    mode = get_ssot_mode(root)
    if mode != "repo-env-contract":
        errors.append("SSOT mode gate failed: docs/project/env-ssot.json must set mode=repo-env-contract")

    vars_def, contract_errors = parse_contract(root)
    errors.extend(contract_errors)

    values_path = root / "env" / "values" / f"{env}.yaml"
    local_values_path = root / "env" / "values" / f"{env}.local.yaml"
    values, v_err = load_values_file(values_path)
    local_values, lv_err = load_values_file(local_values_path)
    errors.extend(v_err)
    errors.extend(lv_err)

    values, v_err2, v_warn2 = canonicalize_values_for_env(vars_def, values, env=env, source_path=values_path)
    local_values, lv_err2, lv_warn2 = canonicalize_values_for_env(vars_def, local_values, env=env, source_path=local_values_path)
    errors.extend(v_err2)
    errors.extend(lv_err2)
    warnings.extend(v_warn2)
    warnings.extend(lv_warn2)

    secrets_ref, s_err = load_secrets_ref(root / "env" / "secrets" / f"{env}.ref.yaml")
    errors.extend(s_err)

    effective: Dict[str, Any] = {}

    # Defaults first (non-secret only).
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if vdef.secret:
            continue
        if vdef.default is not None:
            effective[name] = vdef.default

    # Overlay values.
    for src, src_path in ((values, values_path), (local_values, local_values_path)):
        for k, v in src.items():
            vdef = vars_def.get(k)
            if vdef is None:
                continue
            t_err = type_check_value(vdef, v)
            if t_err:
                errors.append(f"Type check failed for {k} in {src_path}: {t_err}")
                continue
            effective[k] = v

    # Resolve secrets.
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if not vdef.secret:
            continue
        if not vdef.secret_ref:
            missing.append(f"{name} (missing secret_ref in contract)")
            continue
        ref_cfg = secrets_ref.get(vdef.secret_ref)
        if ref_cfg is None:
            missing.append(f"{name} (missing secret ref entry: {vdef.secret_ref} in env/secrets/{env}.ref.yaml)")
            continue
        val, err = resolve_secret(root, env, vdef.secret_ref, ref_cfg)
        if err:
            missing.append(f"{name} (secret material unavailable: {err})")
            continue
        effective[name] = val

    # Ensure required keys.
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if not vdef.required:
            continue
        if name not in effective or effective[name] in (None, ""):
            missing.append(f"{name} (required but missing)")

    if missing:
        errors.extend(missing)

    # Strongly prefer env selector to match.
    if "APP_ENV" in vars_def and applicable(vars_def["APP_ENV"], env) and vars_def["APP_ENV"].state != "removed":
        effective["APP_ENV"] = env

    status = "PASS" if not errors else "FAIL"

    env_file_name = envfile_name_for(env)
    env_file_path = root / env_file_name

    ctx_path = root / "docs" / "context" / "env" / f"effective-{env}.json"

    keys_summary: Dict[str, Any] = {}
    for k in sorted(effective.keys()):
        vdef = vars_def.get(k)
        keys_summary[k] = {
            "secret": bool(vdef.secret) if vdef else False,
            "present": True,
            "type": vdef.type if vdef else "unknown",
        }

    report = {
        "timestamp_utc": ts,
        "env": env,
        "status": status,
        "env_file": str(env_file_path),
        "effective_context": str(ctx_path),
        "missing": missing,
        "errors": errors,
        "warnings": warnings,
        "keys": keys_summary,
    }

    if status == "PASS":
        if not no_write:
            write_env_file(env_file_path, effective)
        ensure_dirs(ctx_path)
        redacted = {
            "generated_at_utc": ts,
            "env": env,
            "values": redact_effective(vars_def, effective),
        }
        ctx_path.write_text(json.dumps(redacted, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")

    md = render_markdown_compile(report)
    if out:
        ensure_dirs(out)
        out.write_text(md, encoding="utf-8")
    else:
        print(md)

    return 0 if status == "PASS" else 1


def cmd_connectivity(root: Path, env: str, out: Optional[Path]) -> int:
    # Use compile's effective env resolution but do not write env file.
    # We'll re-run compile logic with no_write and capture effective values.

    vars_def, contract_errors = parse_contract(root)
    if contract_errors:
        summary = {
            "timestamp_utc": utc_now_iso(),
            "env": env,
            "status": "FAIL",
            "errors": contract_errors,
        }
        md = "# Connectivity Smoke\n\n" + json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
        if out:
            ensure_dirs(out)
            out.write_text(md, encoding="utf-8")
        else:
            print(md)
        return 1

    # Reuse compile internals by building effective map in-memory.
    values_path = root / "env" / "values" / f"{env}.yaml"
    local_values_path = root / "env" / "values" / f"{env}.local.yaml"
    values, v_err = load_values_file(values_path)
    local_values, lv_err = load_values_file(local_values_path)
    secrets_ref, s_err = load_secrets_ref(root / "env" / "secrets" / f"{env}.ref.yaml")

    errors: List[str] = []
    warnings: List[str] = []
    errors.extend(v_err)
    errors.extend(lv_err)
    errors.extend(s_err)

    values, v_err2, v_warn2 = canonicalize_values_for_env(vars_def, values, env=env, source_path=values_path)
    local_values, lv_err2, lv_warn2 = canonicalize_values_for_env(vars_def, local_values, env=env, source_path=local_values_path)
    errors.extend(v_err2)
    errors.extend(lv_err2)
    warnings.extend(v_warn2)
    warnings.extend(lv_warn2)

    effective: Dict[str, Any] = {}
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if vdef.secret:
            continue
        if vdef.default is not None:
            effective[name] = vdef.default

    for src in (values, local_values):
        for k, v in src.items():
            vdef = vars_def.get(k)
            if vdef is None:
                continue
            if vdef.secret or not applicable(vdef, env) or vdef.state == "removed":
                continue
            t_err = type_check_value(vdef, v)
            if t_err:
                errors.append(f"Type check failed for {k}: {t_err}")
                continue
            effective[k] = v

    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if not vdef.secret:
            continue
        if not vdef.secret_ref:
            continue
        ref_cfg = secrets_ref.get(vdef.secret_ref)
        if not ref_cfg:
            continue
        val, err = resolve_secret(root, env, vdef.secret_ref, ref_cfg)
        if err:
            errors.append(f"Secret unresolved for connectivity check: {name} ({err})")
            continue
        effective[name] = val

    report = connectivity_report(vars_def, effective, env)
    status = "PASS" if not errors and all(c.get("status") in {"PASS", "SKIP"} for c in report.get("checks", [])) else "FAIL"

    md_lines: List[str] = []
    md_lines.append("# Connectivity Smoke")
    md_lines.append("")
    md_lines.append(f"- Timestamp (UTC): `{report.get('timestamp_utc')}`")
    md_lines.append(f"- Env: `{env}`")
    md_lines.append(f"- Status: **{status}**")
    md_lines.append("")
    if errors:
        md_lines.append("## Errors")
        for e in errors:
            md_lines.append(f"- {e}")
        md_lines.append("")
    if warnings:
        md_lines.append("## Warnings")
        for w in warnings:
            md_lines.append(f"- {w}")
        md_lines.append("")

    md_lines.append("## Details (redacted)")
    md_lines.append("```json")
    md_lines.append(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False))
    md_lines.append("```")
    md_lines.append("")
    md_lines.append("## Notes")
    md_lines.append("- Secret values are not printed.")

    md = "\n".join(md_lines) + "\n"
    if out:
        ensure_dirs(out)
        out.write_text(md, encoding="utf-8")
    else:
        print(md)

    return 0 if status == "PASS" else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Local env controller (repo-env-contract)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_doc = sub.add_parser("doctor", help="Diagnose local env readiness and missing inputs.")
    p_doc.add_argument("--root", default=".", help="Project root")
    p_doc.add_argument("--env", default="dev", help="Environment name (default: dev)")
    p_doc.add_argument("--out", default=None, help="Write markdown report to file")

    p_comp = sub.add_parser("compile", help="Compile and write local env file and redacted effective context.")
    p_comp.add_argument("--root", default=".", help="Project root")
    p_comp.add_argument("--env", default="dev", help="Environment name (default: dev)")
    p_comp.add_argument("--out", default=None, help="Write markdown report to file")
    p_comp.add_argument("--no-write", action="store_true", help="Do not write env file (still writes redacted context on PASS)")

    p_conn = sub.add_parser("connectivity", help="Best-effort connectivity smoke checks (redacted).")
    p_conn.add_argument("--root", default=".", help="Project root")
    p_conn.add_argument("--env", default="dev", help="Environment name (default: dev)")
    p_conn.add_argument("--out", default=None, help="Write markdown report to file")

    args = parser.parse_args()
    root = Path(args.root).resolve()
    out = Path(args.out).resolve() if getattr(args, "out", None) else None

    if args.cmd == "doctor":
        return cmd_doctor(root, args.env, out)
    if args.cmd == "compile":
        return cmd_compile(root, args.env, out, no_write=bool(args.no_write))
    if args.cmd == "connectivity":
        return cmd_connectivity(root, args.env, out)

    print(f"Unknown command: {args.cmd}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
