# Feature: environment

## Conclusions (read first)

- Treats `env/contract.yaml` as env var contract SSOT (no secrets in repo)
- Scaffolds `env/values/*` and `env/secrets/*.ref.yaml` (secret refs only)
- Writes the SSOT gate file: `docs/project/env-ssot.json`
- Can generate non-secret artifacts: `.env.example`, `docs/env.md`, `docs/context/env/contract.json`

## How to enable

In `init/project-blueprint.json`:

```json
{
  "features": { "environment": true }
}
```

## What Stage C `apply` does

When enabled, Stage C runs:

Note (Windows): if `python3` is not available, use `python`.

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py init --root .
```

Optional verification + generation (when Stage C is run with `--verify-features`):

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py validate --root .
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py generate --root .
```

## Key outputs

- `docs/project/env-ssot.json`
- `env/contract.yaml`
- `env/values/*.yaml` (non-secret values)
- `env/secrets/*.ref.yaml` (secret refs only; no values)
- `env/inventory/*.yaml`
- Generated (non-secret) artifacts when `generate` runs:
  - `.env.example`
  - `docs/env.md`
  - `docs/context/env/contract.json`

## Safety notes

- Do NOT store secret values in `env/values/*.yaml` or `env/contract.yaml`.
- Use `env/secrets/*.ref.yaml` to reference secrets managed outside the repo.
