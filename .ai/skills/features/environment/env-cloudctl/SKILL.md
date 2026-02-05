---
name: env-cloudctl
description: Plan/apply/verify cloud environment config and secret references using env contract + policy targets; detect drift, rotate secrets, and decommission environments with approval gates. Use for staging/prod deployments and maintenance.
---

# Cloud Environment Control (plan / apply / drift / rotate / decommission)

## Purpose

Manage cloud environment configuration under the `repo-env-contract` SSOT model, with a strict **plan → approval → apply → verify** workflow.

The `env-cloudctl` skill:

- computes desired runtime configuration from:
  - `env/contract.yaml`
  - `env/values/<env>.yaml`
  - `env/secrets/<env>.ref.yaml` (refs only)
  - `docs/project/policy.yaml` (routing + auth/preflight + cloud targets)
- produces a deterministic change plan (diff)
- applies changes only after explicit approval
- detects drift
- rotates secrets (backend-dependent)
- decommissions environments (high risk)
- supports env-file injection via `envfile` provider (local or ssh transport)

## Hard preconditions

1. Env SSOT mode is `repo-env-contract`.
   - Check: `docs/project/env-ssot.json`
2. Policy SSOT exists and includes a matching cloud target.
   - Required: `docs/project/policy.yaml`
   - Required: `policy.env.cloud.targets[]` must match the requested `--env` (and optional `--workload`)

If either is not true, STOP.

If `docs/project/env-ssot.json`, `docs/project/policy.yaml`, or `env/contract.yaml` does not exist (first-time setup), run:

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py init --root .
```

Then customize the contract, policy targets, and secret backends before using cloud operations.

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
- MUST require `--approve-remote` before any SSH/SCP remote command.
- MUST treat **Identity/IAM changes as out of scope for automatic apply**.
  - You may generate a runbook or policy diff, but do not apply permissions changes automatically.
- Template limitation (v1):
  - `rotate` and `decommission` are only implemented for `provider=mockcloud` in this template.
  - For `provider=envfile` (local/ssh), use `plan/apply/verify/drift`. Implement a provider adapter if you need rotation/decommission semantics for real infrastructure.

## Inputs

- Contract: `env/contract.yaml`
- Values: `env/values/<env>.yaml`
- Secret refs: `env/secrets/<env>.ref.yaml`
- Policy: `docs/project/policy.yaml`

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
2. Confirm preconditions (SSOT mode + policy cloud target).
3. Choose evidence directory.

### Phase A — Plan (read-only)

4. Produce a deterministic plan (diff):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py plan --root . --env <env> --workload <optional> --out <EVIDENCE_DIR>/02-apply-plan.md
```

Remote read (ssh transport only):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py plan --root . --env <env> --workload <optional> --remote --approve-remote --out <EVIDENCE_DIR>/02-apply-plan.md
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
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py apply --root . --env <env> --workload <optional> --approve --out <EVIDENCE_DIR>/03-execution-log.md
```

For ssh transport, add `--approve-remote`.

### Phase C — Verify

8. Verify desired == deployed (read-only):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py verify --root . --env <env> --workload <optional> --out <EVIDENCE_DIR>/04-post-verify.md
```

Remote hash check (ssh transport only):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py verify --root . --env <env> --workload <optional> --remote --approve-remote --out <EVIDENCE_DIR>/04-post-verify.md
```

### Phase D — Drift detection

9. Detect drift anytime:

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py drift --root . --env <env> --workload <optional> --out <EVIDENCE_DIR>/01-drift-report.md
```

Remote read (ssh transport only):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py drift --root . --env <env> --workload <optional> --remote --approve-remote --out <EVIDENCE_DIR>/01-drift-report.md
```

### Phase E — Secret rotation (backend dependent)

10. Rotate a secret (requires `--approve`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py rotate --root . --env <env> --workload <optional> --secret <secret_ref_name> --approve --out <EVIDENCE_DIR>/03-execution-log.md
```

### Phase F — Decommission (high risk)

11. Decommission an environment (requires `--approve`):

```bash
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py decommission --root . --env <env> --workload <optional> --approve --out <EVIDENCE_DIR>/03-execution-log.md
```

## Verification

- [ ] SSOT mode is `repo-env-contract`
- [ ] Policy cloud target exists for the env/workload
- [ ] Plan produced and reviewed before apply
- [ ] Explicit approval gate respected
- [ ] Verify passes after apply
- [ ] No secret values in evidence
- [ ] Central test suite passes: `node .ai/tests/run.mjs --suite environment`

## Boundaries

- MUST NOT modify `env/contract.yaml` as part of the `env-cloudctl` workflow.
- MUST NOT apply IAM/Identity changes automatically.
- MUST NOT log secret values.
