# Terraform IaC SSOT

This directory contains Terraform definitions for infrastructure provisioning.

## Required decisions (project-specific)

- State backend (remote recommended; do not commit `*.tfstate`)
- Cloud provider(s) and credentials model (prefer role-based)
- Workspace/environments mapping (dev/staging/prod)

## Quick commands (human/CI executed)

```bash
terraform fmt -recursive
terraform validate
terraform plan
terraform apply
```

## Safety

- Never commit tfstate.
- Never put secrets in Terraform files; prefer secret managers for runtime injection.

