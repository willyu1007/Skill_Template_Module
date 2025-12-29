# Reference: initialize-project-from-requirements

This reference describes the behavior of the init pipeline skill implementation (scripts + templates).
It is the SSOT; other references should link here.

---

## Key conclusions

- Stage A quality is enforced by **structure + placeholders checks** (`check-docs`). It does not attempt deep semantic evaluation.
- Stage B blueprint is the **machine-readable SSOT** used for Stage C scaffolding and skill pack selection.
- Pack selection is explicit:
  - declared in `docs/project/project-blueprint.json` (`skills.packs`)
  - materialized into `.ai/skills/_meta/sync-manifest.json` (flat schema)
  - synced into provider wrappers by `node .ai/scripts/sync-skills.cjs`
- Stage transitions require explicit approval (`approve`), not manual state edits.
- In add-on repos, pack enabling must go through `.ai/scripts/skillsctl.js` (scheme A) when available.

---

## Stage A validation (`check-docs`)

Checks:
- required files exist under `docs/project/` (or `--docs-root`)
- required headings exist
- template placeholders (e.g. “TBD”, “<fill>”) are not left unresolved (warn or error depending on `--strict`)

Command:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs --repo-root . --docs-root docs/project --strict
```

---

## Stage A must-ask checklist (`mark-must-ask`)

Use after asking each must-ask question to keep the state board accurate.

Keys:
- `onePurpose`
- `userRoles`
- `mustRequirements`
- `outOfScope`
- `userJourneys`
- `constraints`
- `successMetrics`

Command:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to docs/project/requirements.md
```

---

## Stage B validation (`validate`)

Checks:
- blueprint JSON parses
- matches expected shape / schema (basic semantic sanity)
- optional: compute recommended packs from `capabilities`/`quality` and report deltas

Command:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate --repo-root . --blueprint docs/project/project-blueprint.json
```

---

## Stage B packs review (`review-packs`)

Use after reviewing `skills.packs` so the state board reflects the review.

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs review-packs --repo-root .
```

---

## Stage C apply (`apply`)

`apply` performs:
1. validate blueprint
2. optional docs check (when `--require-stage-a`)
3. scaffold directories/files (idempotent; “write-if-missing” for docs)
4. generate configs via `scripts/scaffold-configs.cjs` (SSOT)
5. context system setup (core)
6. enable packs (skillsctl when present; else manifest includePrefixes)
7. sync wrappers via `.ai/scripts/sync-skills.cjs`

Notes:
- With `--verify-addons`, add-on verify failures are fail-fast by default.
- Use `--non-blocking-addons` to continue despite verify failures.

---

## Context system (core)

In this template version, context is already present in the repo.

Default behavior:
- context is treated as enabled unless `addons.contextAwareness` is explicitly set to `false`
- enabling context implies enabling the `context-core` pack (and scaffold packs)

Relevant docs:
- `init/ADDON_CONTEXT_AWARENESS.md` (core note)
- `docs/context/INDEX.md`
