# Feature: CI

## Conclusions (read first)

- Installs a practical CI baseline for **GitHub Actions** or **GitLab CI**
- Stage C installs **CI only** (no delivery workflow by default)
- Delivery is **explicit opt-in** (enabled via `ctl-ci add-delivery`)
- CI enablement is controlled by `ci.provider` (default: `github`; set to `none` to disable)

## How to enable

In `init/_work/project-blueprint.json` (legacy: `init/project-blueprint.json`):

```json
{
  "ci": {
    "provider": "github"
  }
}
```

Set `"provider": "gitlab"` to install GitLab CI instead.
Set `"provider": "none"` to disable CI materialization (no CI files generated).
Note: `features.ci` is deprecated/ignored (provider selection is the SSOT).

## What Stage C `apply` does

When enabled, Stage C:

1) Runs the CI controller:

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs init --provider <github|gitlab> --repo-root .
```

2) Materializes (copy-if-missing):
- GitHub Actions: `.github/workflows/ci.yml`
- GitLab CI: `.gitlab-ci.yml`
- CI metadata: `ci/**` (`ci/config.json`, `ci/handbook/`, etc.)

3) Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs verify --repo-root .
```

When `ci.provider=none`, Stage C skips CI entirely:

- No `.github/workflows/*`
- No `.gitlab-ci.yml`
- No `ci/**`

## Delivery (explicit opt-in)

Stage C does **not** install delivery workflows.

Enable delivery explicitly (method A):

```bash
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider github --repo-root .
node .ai/skills/features/ci/scripts/ctl-ci.mjs add-delivery --provider gitlab --repo-root .
```

## Acceptance

- `node .ai/skills/features/ci/scripts/ctl-ci.mjs --help` documents `init`, `add-delivery`, and `verify`
- Stage C installs exactly one CI provider workflow based on `ci.provider`
