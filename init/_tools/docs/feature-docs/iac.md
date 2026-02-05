# Feature: iac

## Conclusions (read first)

- Supports exactly **one** IaC tool per project: `ros` or `terraform` (no dual SSOT)
- Enabled/disabled by **tool selection**:
  - `iac.tool=none` (or omitted) disables IaC materialization
  - `iac.tool=ros|terraform` enables IaC materialization
- Materializes IaC SSOT under `ops/iac/<tool>/`
- Generates a **non-secret** IaC overview for Context-Awareness:
  - `docs/context/iac/overview.json`
  - Registered in `docs/context/project.registry.json` as `artifactId: iac.overview`

## How to enable

In `init/_work/project-blueprint.json` (legacy: `init/project-blueprint.json`):

```json
{
  "iac": { "tool": "terraform" }
}
```

Valid values (case-insensitive): `none | ros | terraform`.

To disable:

```json
{ "iac": { "tool": "none" } }
```

Or omit `iac` entirely.

## What Stage C `apply` does

When enabled, Stage C:

1) Copies templates from `.ai/skills/features/iac/templates/<tool>/` into the repo root (copy-if-missing; `--force-features` overwrites)
2) Runs:

```bash
node .ai/skills/features/iac/scripts/iacctl.mjs init --tool <tool> --repo-root .
```

Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/iac/scripts/iacctl.mjs verify --repo-root .
```

## Key outputs

- `ops/iac/handbook/`
- `ops/iac/<tool>/` (`ros` or `terraform`)
- `docs/context/iac/overview.json` (generated; no secrets)
- `docs/context/project.registry.json` (adds/updates `iac.overview`)

## Safety notes

- IaC `plan/apply` is **human/CI executed**. This feature does not auto-apply infrastructure.
- Never store secrets in IaC code or `docs/context/iac/*`.
- Do not keep both `ops/iac/ros/` and `ops/iac/terraform/`.

