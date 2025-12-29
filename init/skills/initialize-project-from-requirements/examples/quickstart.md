# Quickstart (example)

Run these commands from repo root.

---

## 0) Initialize state

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs start --repo-root .
```

---

## 1) Stage A: validate docs → approve

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs \
  --repo-root . \
  --docs-root docs/project \
  --strict
```

Optional: record must-ask checklist progress:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to docs/project/requirements.md
```

After the user explicitly approves Stage A:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage A --repo-root .
```

---

## 2) Stage B: validate blueprint → approve

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json
```

Optional: show recommended packs:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs suggest-packs \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json
```

Optional: record pack review:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs review-packs --repo-root .
```

After the user explicitly approves Stage B:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage B --repo-root .
```

---

## 3) Stage C: apply → approve

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json \
  --providers both
```

After the user explicitly approves Stage C:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage C --repo-root .
```

---

## 4) Optional cleanup

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand
```
