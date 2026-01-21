# Reference: initialize-project-from-requirements

This reference describes the behavior of the init pipeline implementation (scripts + templates).
The file is the SSOT; other references should link here.

---

## Key conclusions

- Stage A quality is enforced by **structure + placeholder checks** (`check-docs`). The check does not attempt deep semantic evaluation.
- Stage B blueprint is the **machine-readable SSOT** used for Stage C scaffold/config generation and pack selection.
- Pack selection is explicit:
  - declared in `init/project-blueprint.json` (`skills.packs`) during initialization
  - archived to `docs/project/project-blueprint.json` by `cleanup-init --archive`
  - materialized into `.ai/skills/_meta/sync-manifest.json` (flat schema)
  - synced into provider wrappers by `node .ai/scripts/sync-skills.mjs`
- Stage transitions require explicit approval (`approve`), not manual state edits.
- When `.ai/skills/_meta/skillpacksctl.mjs` is available, pack enabling is performed through `skillpacksctl`; otherwise Stage C falls back to editing the sync manifest.
- Optional **features** are materialized in Stage C from templates stored under `.ai/skills/features/...`.

---

## Stage A validation (`check-docs`)

Checks:
- required files exist under `init/stage-a-docs/` by default (or `--docs-root`)
- required headings exist
- template placeholders (e.g. `TBD`, `<fill>`) are not left unresolved (warn or error depending on `--strict`)

Command:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs --repo-root . --docs-root init/stage-a-docs --strict
```

---

## Stage A must-ask checklist (`mark-must-ask`)

Use after asking each must-ask question so the state board stays accurate.

Keys:
- `terminologyAlignment`
- `onePurpose`
- `userRoles`
- `mustRequirements`
- `outOfScope`
- `userJourneys`
- `constraints`
- `successMetrics`

Command:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to init/stage-a-docs/requirements.md
```

---

## Stage B validation (`validate`)

Checks:
- blueprint JSON parses
- matches expected shape / schema (basic sanity)
- optional: compute recommended packs from `capabilities`/`quality` and report deltas

Command:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root . --blueprint init/project-blueprint.json
```

---

## Stage B packs review (`review-packs`)

Use after reviewing `skills.packs` so the state board reflects the review.

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .
```

---

## Stage C apply (`apply`)

`apply` performs:

1. validate blueprint
2. optional docs check (when `--require-stage-a`)
3. scaffold directories/files (idempotent; mostly "write-if-missing")
4. generate configs via `scripts/scaffold-configs.mjs` (SSOT)
5. materialize optional **features** from templates under `.ai/skills/features/.../templates/` and run their control scripts (`...ctl.mjs init`)
6. enable packs (skillpacksctl when present; else sync manifest)
7. sync wrappers via `.ai/scripts/sync-skills.mjs`

Notes:
- With `--verify-features`, feature verify failures are **fail-fast** by default.
- Use `--non-blocking-features` to continue despite verify failures.

---

## Feature: context awareness

Enable via blueprint:

- `features.contextAwareness: true`

`context.*` is configuration only and does not trigger enabling by itself.

Implications:
- Stage C materializes `docs/context/**` and environment templates, then runs `.ai/skills/features/context-awareness/scripts/contextctl.mjs init`
- Optional: add `context-core` to `skills.packs` if you want context-awareness skills/wrappers

See:
- `.ai/skills/features/context-awareness/`
