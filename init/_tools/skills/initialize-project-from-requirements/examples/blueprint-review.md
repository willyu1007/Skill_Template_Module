# Example - Blueprint review checklist

Before applying Stage C, review `init/_work/project-blueprint.json` (legacy: `init/project-blueprint.json`).

> **Note**: The blueprint is stored in `init/_work/project-blueprint.json` during initialization (legacy: `init/project-blueprint.json`). After completion, use `cleanup-init --archive` to archive it to `docs/project/overview/project-blueprint.json`.

---

## Checklist

- `project.name` is stable and does not depend on an implementation detail.
- `repo.layout` matches intended structure (`single` vs `monorepo`).
- `capabilities.*` reflect **decisions**, not aspirations (avoid setting `enabled=true` for "maybe later").
- `skills.packs` includes only what you want enabled now.
- Provider selections are intentional (especially `db.ssot` and `ci.provider`), and feature overrides (`features.<id>=false`) are intentional.
- No secrets are present (no tokens, passwords, connection strings).

---

## Validate

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate \
  --repo-root .
```

---

## Reconcile packs (recommended)

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs \
  --repo-root .
```

If you want the pipeline to **safe-add** missing recommended packs into the blueprint (it will not remove anything), run:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs \
  --repo-root . \
  --write
```

---

## Record pack review (recommended)

After reviewing `skills.packs`, record the review in the init state:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .
```
