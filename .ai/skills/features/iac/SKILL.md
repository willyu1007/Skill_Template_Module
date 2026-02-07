---
name: iac
description: Enable and operate the IaC feature (ROS or Terraform), materializing `ops/iac/<tool>/` and integrating IaC context into Context-Awareness.
---

# IaC Feature (`iac`)

## Intent

Provide a **single** Infrastructure-as-Code (IaC) shape per project:

- `ros` (Alibaba Cloud ROS templates)
- `terraform`

and publish a **non-secret** IaC overview into the Context-Awareness layer (`docs/context/iac/*`).

## What gets enabled (Stage C materialization)

When enabled (via blueprint `iac.tool`):

- `ops/iac/<tool>/` (SSOT: IaC definitions)
- `ops/iac/handbook/` (runbooks/decisions/logs)
- `docs/context/iac/overview.json` (generated, no secrets)
- `docs/context/project.registry.json` entry: `iac.overview` (generated artifact registration)

Controller script:

- `node .ai/skills/features/iac/scripts/ctl-iac.mjs`

## How to enable (Init Stage B/C)

In `init/_work/project-blueprint.json`:

```json
{
  "iac": { "tool": "terraform" }
}
```

Valid values: `none | ros | terraform` (case-insensitive).  
When omitted or `none`, IaC feature is **not** enabled.

## Operating rules

- **No dual SSOT**: do not keep both `ops/iac/ros/` and `ops/iac/terraform/`.
- IaC `plan/apply` is **human/CI executed**. The `iac` feature does not auto-apply infrastructure.
- Never store secret values in IaC code or context artifacts.

## Verification

```bash
node .ai/skills/features/iac/scripts/ctl-iac.mjs verify --repo-root .
```

## Boundaries

- The `iac` feature does **not** execute IaC apply. `terraform/ros` plan/apply is human/CI executed.
- The `iac` feature does **not** configure IAM/identity; treat identity as IaC-owned.
- Never write secret values into `ops/iac/**` templates or `docs/context/iac/*`.
