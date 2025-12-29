# CI Templates (Core)

Historically, the template shipped a `ci-templates` add-on.

In the **module-first** version of the template, CI templates are a **core capability** and are already present in the repository.

## What you get

- `ci/` directory for CI contracts/templates
- `.gitlab-ci/` helper templates (if you use GitLab)
- Control script: `node .ai/scripts/cictl.js`

## Typical workflow

```bash
node .ai/scripts/cictl.js init
node .ai/scripts/cictl.js validate
```

## Notes

- Optional add-ons under `addons/` are reserved for packaging/deployment/release/observability.
