# Quickstart (example)

> **SSOT**: For the complete command reference, see `../SKILL.md`.
> This document provides a minimal copy-paste example flow.

Run these commands from repo root.

> **Note**: During initialization, working files are stored in `init/_work/` (legacy: `init/`). After completion, use `cleanup-init --archive` to archive:
> - Stage A docs -> `docs/project/overview/`
> - Blueprint -> `docs/project/overview/project-blueprint.json`

---

## 0) Initialize state

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root .
```

This creates:
- `init/_work/stage-a-docs/` - Stage A document templates
- `init/_work/project-blueprint.json` - Blueprint template
- `init/_work/.init-state.json` - State tracking file

---

## 1) Stage A: validate docs -> approve

Edit the templates in `init/_work/stage-a-docs/`, then validate:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs \
  --repo-root . \
  --strict
```

Optional: record must-ask checklist progress:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to init/_work/stage-a-docs/requirements.md
```

After the user explicitly approves Stage A:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage A --repo-root .
```

---

## 2) Stage B: validate blueprint -> approve

Edit `init/_work/project-blueprint.json`, then validate:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate \
  --repo-root .
```

Optional: show recommended packs:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs \
  --repo-root .
```

Optional: record pack review:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .
```

After the user explicitly approves Stage B:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```

---

## 3) Stage C: apply -> approve

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply \
  --repo-root . \
  --providers both
```

Before Stage C approval (required): review skill retention and record it:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-skill-retention --repo-root .
```

After the user explicitly approves Stage C:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage C --repo-root .
```

---

## 4) Optional cleanup

**Option A: Remove init/ only**

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand
```

**Option B: Archive to docs/project/ + remove init/** (recommended)

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --archive
```
