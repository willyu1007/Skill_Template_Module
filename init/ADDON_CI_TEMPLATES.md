# CI Templates (Core)

This repository includes CI templates/tooling as a **built-in capability** (no add-on installation required).

## What you get

- `ci/` workspace for CI configuration + workdocs
- `.gitlab-ci/` helper templates (optional; GitLab)
- Control script: `node .ai/scripts/cictl.js`

## Typical workflow

```bash
node .ai/scripts/cictl.js init
node .ai/scripts/cictl.js enable-feature lint
node .ai/scripts/cictl.js enable-feature test
node .ai/scripts/cictl.js generate
node .ai/scripts/cictl.js verify
```

## Notes

- Optional add-ons under `addons/` are reserved for packaging/deployment/release/observability.
