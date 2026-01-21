# Approval gates (mandatory)

This skill enforces a strict split:

- `plan` and `drift` are read-only.
- `apply`, `rotate`, and `decommission` require explicit approval.

## Human approval checklist

- Target env confirmed
- Change summary reviewed
- Rollback plan understood
- Maintenance window confirmed
- Identity/IAM impacts assessed separately
