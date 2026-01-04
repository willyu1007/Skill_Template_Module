# Agent guidance for the init kit

The repository includes an `init/` bootstrap kit that is intended to be executed in a **checkpointed** manner.

Key principles:

- Do not skip stages.
- Do not advance stages without explicit user approval.
- Do not hand-edit `init/.init-state.json` to change stages; use the pipeline commands.

---

## Canonical command entry point

Run from repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs <command> [options]
```

---

## Stage flow (validation + approval)

### Stage A (requirements docs)
1) Run start to create templates:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs start --repo-root .
```

The command automatically creates:
- `init/stage-a-docs/requirements.md`
- `init/stage-a-docs/non-functional-requirements.md`
- `init/stage-a-docs/domain-glossary.md`
- `init/stage-a-docs/risk-open-questions.md`
- `init/project-blueprint.json`

2) Fill in the Stage A docs, then validate:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs --strict
```

3) After user approval:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage A --repo-root .
```

### Stage B (blueprint)
1) Edit `init/project-blueprint.json`, then validate:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate
```

2) After user approval:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage B --repo-root .
```

### Stage C (apply)
Apply scaffold/configs/skill packs/wrapper sync:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply --providers both
```

After user approval:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage C --repo-root .
```

---

## Core notes (context system)

In the module-first template, the context system is **built-in** (not an add-on):

- `docs/context/project.registry.json` (SSOT)
- `modules/<module_id>/interact/registry.json` (SSOT)
- `docs/context/registry.json` (derived)
- Scripts: `contextctl.js`, `projectctl.js`

The init pipeline will treat context as **enabled by default** and will:

- initialize project state via `projectctl.js`
- initialize/build context via `contextctl.js`

If you explicitly disable context in a blueprint (for unusual use cases), you can set:

```json
{
  "addons": {
    "contextAwareness": false
  }
}
```

The setting will skip context-related steps, but the files remain present (core capability).

## Cleanup

Only after completion and user confirmation:

**Option A: Remove `init/` only (no archive)**

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init --repo-root . --apply --i-understand
```

**Option B: Archive to docs/project/ then remove `init/`** (recommended)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --archive
```

The command archives Stage A docs and Blueprint to `docs/project/` before deleting `init/`.

**Option C: Archive + prune unused add-ons**

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --archive \
  --cleanup-addons
```

### Archive options

| Option | Effect |
|--------|--------|
| `--archive` | Archive all (Stage A docs + Blueprint) to `docs/project/` |
| `--archive-docs` | Archive Stage A docs only |
| `--archive-blueprint` | Archive Blueprint only |
