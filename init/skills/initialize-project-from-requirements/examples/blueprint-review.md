# Example - Blueprint review checklist

Before applying Stage C, review `docs/project/project-blueprint.json`.

---

## Checklist

- `project.name` is stable and does not depend on an implementation detail.
- `repo.layout` matches intended structure (`single` vs `monorepo`).
- `capabilities.*` reflect **decisions**, not aspirations (avoid setting `enabled=true` for “maybe later”).
- `skills.packs` includes only what you want enabled now.
- Add-on flags are intentional (e.g. `addons.contextAwareness`).
- No secrets are present (no tokens, passwords, connection strings).

---

## Validate

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json
```

---

## Reconcile packs (recommended)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs suggest-packs \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json
```

If you want the pipeline to **safe-add** missing recommended packs into the blueprint (it will not remove anything), run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs suggest-packs \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json \
  --write
```

---

## Record pack review (recommended)

After reviewing `skills.packs`, record the review in the init state:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs review-packs --repo-root .
```
