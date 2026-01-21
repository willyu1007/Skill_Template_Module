# Feature: CI

## Conclusions (read first)

- Installs a practical CI baseline for **GitHub Actions** or **GitLab CI**
- Stage C installs **CI only** (no delivery workflow by default)
- Delivery is **explicit opt-in** (enabled via `cictl add-delivery`)

## How to enable

In `init/project-blueprint.json`:

```json
{
  "features": {
    "ci": true
  },
  "ci": {
    "provider": "github"
  }
}
```

Set `"provider": "gitlab"` to install GitLab CI instead.

## What Stage C `apply` does

When enabled, Stage C:

1) Runs the CI controller:

```bash
node .ai/skills/features/ci/scripts/cictl.mjs init --provider <github|gitlab> --repo-root .
```

2) Materializes (copy-if-missing):
- GitHub Actions: `.github/workflows/ci.yml`
- GitLab CI: `.gitlab-ci.yml`
- CI metadata: `ci/**` (`ci/config.json`, `ci/workdocs/`, etc.)

3) Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/ci/scripts/cictl.mjs verify --repo-root .
```

## Delivery (explicit opt-in)

Stage C does **not** install delivery workflows.

Enable delivery explicitly (method A):

```bash
node .ai/skills/features/ci/scripts/cictl.mjs add-delivery --provider github --repo-root .
node .ai/skills/features/ci/scripts/cictl.mjs add-delivery --provider gitlab --repo-root .
```

## Acceptance

- `node .ai/skills/features/ci/scripts/cictl.mjs --help` documents `init`, `add-delivery`, and `verify`
- Stage C installs exactly one CI provider workflow based on `ci.provider`
