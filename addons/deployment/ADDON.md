# Deployment Add-on (Optional)

## Conclusions (read first)

- This add-on provides **multi-environment deployment** infrastructure.
- Supports multiple deployment models: K8s, serverless, VM, PaaS.
- AI plans deployments; humans execute and approve.

## What this add-on writes (blast radius)

New files/directories (created if missing):

- `ops/deploy/` (deployment root)
  - `ops/deploy/AGENTS.md` (LLM guidance)
  - `ops/deploy/http_services/` (HTTP service configs)
  - `ops/deploy/workloads/` (background workload configs)
  - `ops/deploy/clients/` (client application configs)
  - `ops/deploy/k8s/` (Kubernetes-specific, if enabled)
  - `ops/deploy/environments/` (environment configs)
  - `ops/deploy/scripts/` (deployment scripts)
  - `ops/deploy/workdocs/` (deployment plans)
- `.ai/scripts/deployctl.js` (deployment management)
- `.ai/scripts/deploy.js` (deploy execution entry)
- `.ai/scripts/rollback.js` (rollback script)
- `docs/addons/deployment/` (add-on documentation)

## Install

### Option A: Via init-pipeline (recommended)

Enable in your `project-blueprint.json`:

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
      "tool": "helm",
      "namespaces": ["default"]
    }
  }
}
```

Then run:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply --blueprint docs/project/project-blueprint.json
```

### Option B: Install manually

1. Copy payload contents into the repository root.
2. Initialize deployment:
   ```bash
   node .ai/scripts/deployctl.js init --model k8s
   ```

## Usage

### Initialize Deployment

```bash
# Initialize with Kubernetes
node .ai/scripts/deployctl.js init --model k8s

# Initialize for serverless
node .ai/scripts/deployctl.js init --model serverless
```

### Register Services

```bash
# Register a service for deployment
node .ai/scripts/deployctl.js add-service --id api --artifact api:v1.0.0

# List registered services
node .ai/scripts/deployctl.js list
```

### Plan Deployment

```bash
# Generate deployment plan
node .ai/scripts/deployctl.js plan --service api --env staging

# Show deployment status
node .ai/scripts/deployctl.js status --env staging
```

### View History

```bash
# Show deployment history
node .ai/scripts/deployctl.js history --service api
```

## Deployment Models

| Model | Description | K8s Sub-mode |
|-------|-------------|--------------|
| `k8s` | Kubernetes deployment | Yes (helm/kustomize/manifests) |
| `serverless` | Cloud functions | No |
| `vm` | Virtual machines | No |
| `paas` | Platform-as-a-Service | No |

## Kubernetes Sub-modes

When using `k8s` model:

- `helm` - Helm charts in `ops/deploy/k8s/helm/`
- `kustomize` - Kustomize overlays in `ops/deploy/k8s/kustomize/`
- `manifests` - Raw K8s manifests in `ops/deploy/k8s/manifests/`

## Verification

```bash
# Verify deployment configuration
node .ai/scripts/deployctl.js verify

# Check status
node .ai/scripts/deployctl.js status --env staging
```

## Rollback / Uninstall

Delete these paths:

- `ops/deploy/`
- `.ai/scripts/deployctl.js`
- `.ai/scripts/deploy.js`
- `.ai/scripts/rollback.js`
- `docs/addons/deployment/`

