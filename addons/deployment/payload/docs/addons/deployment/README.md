# Deployment Add-on

## Purpose

This add-on provides **multi-environment deployment** infrastructure supporting various deployment models.

## Deployment Models

| Model | Description | K8s Sub-modes |
|-------|-------------|---------------|
| `k8s` | Kubernetes | helm, kustomize, manifests |
| `serverless` | Cloud functions | - |
| `vm` | Virtual machines | - |
| `paas` | Platform-as-a-Service | - |

## Key Concepts

### Service Registration

Services must be registered before deployment:

```bash
node .ai/scripts/deployctl.js add-service --id api --artifact api:v1.0.0
```

### Environment Configuration

Environments are configured in `ops/deploy/environments/`:

- `dev.yaml` - Development settings
- `staging.yaml` - Staging settings
- `prod.yaml` - Production settings

### Deployment Planning

AI generates deployment plans, but humans execute:

```bash
node .ai/scripts/deployctl.js plan --service api --env staging
```

## Kubernetes Support

When using `k8s` model:

### Helm Charts

Place charts in `ops/deploy/k8s/helm/`

### Kustomize

Place overlays in `ops/deploy/k8s/kustomize/`

### Raw Manifests

Place YAML files in `ops/deploy/k8s/manifests/`

## AI/LLM Usage

When working with deployments, AI should:

1. **Register** services via `deployctl add-service`
2. **Plan** deployments via `deployctl plan`
3. **Document** decisions in `workdocs/`
4. **Never** execute deployments directly

Humans execute and approve all deployments.

## Quick Reference

```bash
# Initialize
node .ai/scripts/deployctl.js init --model k8s

# Add service
node .ai/scripts/deployctl.js add-service --id api

# Plan deployment
node .ai/scripts/deployctl.js plan --service api --env staging

# Check status
node .ai/scripts/deployctl.js status --env staging
```

