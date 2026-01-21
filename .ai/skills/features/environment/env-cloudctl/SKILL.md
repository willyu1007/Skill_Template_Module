---
name: env-cloudctl
description: Plan/apply/verify cloud environment config and secret references using env contract + inventory; detect drift, rotate secrets, and decommission environments with approval gates. Use for staging/prod deployments and maintenance.
---

# Cloud Environment Control (plan / apply / drift / rotate / decommission)

## Purpose

Manage cloud environment configuration under the `repo-env-contract` SSOT model, with a strict **plan → approval → apply → verify** workflow.

The `env-cloudctl` skill:

- computes desired runtime configuration from:
  - `env/contract.yaml`
  - `env/values/<env>.yaml`
  - `env/secrets/<env>.ref.yaml` (refs only)
  - `env/inventory/<env>.yaml` (routing)
- produces a deterministic change plan (diff)
- applies changes only after explicit approval
- detects drift
- rotates secrets (backend-dependent)
- decommissions environments (high risk)

## Hard preconditions

1. Env SSOT mode is `repo-env-contract`.
   - Check: `docs/project/env-ssot.json`
2. The target env has an inventory file.
   - Required: `env/inventory/<env>.yaml`

If either is not true, STOP.

If `docs/project/env-ssot.json` or `env/contract.yaml` does not exist (first-time setup), run:

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py init --root .
```

Then customize the contract and inventory before using cloud operations.

## When to use

Use when the user asks to:

- deploy or update configuration for staging/prod
- preview changes (plan/diff) before a release
- check configuration drift
- rotate or revoke secrets
- decommission an environment

Avoid when:

- you need to change the contract schema (use `env-contractctl`)
- the issue is only local-machine bootstrap (use `env-localctl`)

## Invariants

- MUST NOT request users to paste secrets into chat.
- MUST NOT materialize secret values in evidence artifacts.
- MUST do a plan/diff before any apply.
- MUST require explicit approval before apply/rotate/decommission.
- MUST treat **Identity/IAM changes as out of scope for automatic apply**.
  - You may generate a runbook or policy diff, but do not apply permissions changes automatically.

## Inputs

- Contract: `env/contract.yaml`
- Values: `env/values/<env>.yaml`
- Secret refs: `env/secrets/<env>.ref.yaml`
- Inventory: `env/inventory/<env>.yaml`

## Outputs (evidence + context)

### Evidence directory

Choose one evidence location (no secrets):

- Recommended:
  - `dev-docs/active/<task-slug>/artifacts/env-cloud/`
- Otherwise:
  - `.ai/.tmp/env-cloud/<run-id>/`

Evidence files (templates available in `./templates/`):

- `00-target-and-scope.md`
- `01-drift-report.md`
- `02-apply-plan.md`
- `03-execution-log.md`
- `04-post-verify.md`
- `05-context-refresh.md`

### Context artifacts (safe for LLM)

- `docs/context/env/effective-cloud-<env>.json` (redacted)

## Steps

### Phase 0 — Confirm scope

1. Confirm target env (must be explicit): `staging` / `prod` / other.
2. Confirm preconditions (SSOT mode + inventory).
3. Choose evidence directory.

### Phase A — Plan (read-only)

4. Produce a deterministic plan (diff):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py plan --root . --env <env> --out <EVIDENCE_DIR>/02-apply-plan.md
```

5. Record `00-target-and-scope.md` and summarize high-risk operations.

### Approval checkpoint (mandatory)

6. Ask for explicit user approval before apply, confirming:

- target env
- change summary
- rollback expectations
- whether the change is within an approved maintenance window

### Phase B — Apply (write)

7. Apply the plan (requires `--approve`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py apply --root . --env <env> --approve --out <EVIDENCE_DIR>/03-execution-log.md
```

### Phase C — Verify

8. Verify desired == deployed (read-only):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py verify --root . --env <env> --out <EVIDENCE_DIR>/04-post-verify.md
```

### Phase D — Drift detection

9. Detect drift anytime:

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py drift --root . --env <env> --out <EVIDENCE_DIR>/01-drift-report.md
```

### Phase E — Secret rotation (backend dependent)

10. Rotate a secret (requires `--approve`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py rotate --root . --env <env> --secret <secret_ref_name> --approve --out <EVIDENCE_DIR>/03-execution-log.md
```

### Phase F — Decommission (high risk)

11. Decommission an environment (requires `--approve`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py decommission --root . --env <env> --approve --out <EVIDENCE_DIR>/03-execution-log.md
```

## Verification

- [ ] SSOT mode is `repo-env-contract`
- [ ] Inventory file exists for the env
- [ ] Plan produced and reviewed before apply
- [ ] Explicit approval gate respected
- [ ] Verify passes after apply
- [ ] No secret values in evidence
- [ ] Central test suite passes: `node .ai/tests/run.mjs --suite environment`

## Boundaries

- MUST NOT modify `env/contract.yaml` as part of the `env-cloudctl` workflow.
- MUST NOT apply IAM/Identity changes automatically.
- MUST NOT log secret values.
