# Deployment Add-on

## Conclusions (read first)

- Provides multi-environment deployment infrastructure
- Supports K8s, serverless, VM, PaaS deployment models
- AI plans deployments; humans execute and approve

## How to enable

In `project-blueprint.json`:

```json
{
  "addons": {
    "deployment": true
  },
  "deploy": {
    "enabled": true,
    "model": "k8s",
    "environments": ["dev", "staging", "prod"],
    "k8s": {
      "tool": "helm"
    }
  }
}
```

Then run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply --blueprint docs/project/project-blueprint.json
```

## What gets installed

- `ops/deploy/` - Deployment root
  - `ops/deploy/k8s/` - Kubernetes configs
  - `ops/deploy/environments/` - Environment configs
  - `ops/deploy/workdocs/runbooks/` - Runbooks
- `.ai/scripts/deployctl.js` - Deployment management
- `.ai/scripts/deploy.js` - Deploy entry point
- `.ai/scripts/rollback.js` - Rollback script

## Commands

```bash
# Add a service
node .ai/scripts/deployctl.js add-service --id api --artifact api:v1.0.0

# Plan deployment
node .ai/scripts/deployctl.js plan --service api --env staging

# Check status
node .ai/scripts/deployctl.js status --env staging

# Verify
node .ai/scripts/deployctl.js verify
```

## See also

- `addons/deployment/ADDON.md` - Full documentation

