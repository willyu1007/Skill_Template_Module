# Stage C: Scaffold + configs + skills

Stage C applies the blueprint to the repository:

- create minimal directory scaffold
- generate configuration files (SSOT: `scripts/scaffold-configs.cjs`)
- enable skill packs (manifest / skillsctl scheme A)
- sync provider wrappers (`.ai/scripts/sync-skills.cjs`)
- optionally install/initialize add-ons (context awareness)
- optionally create DevOps convention scaffold (`ops/`)

---

## Dry-run scaffold (optional)

Before writing anything, you can preview the scaffold plan:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs scaffold \
  --repo-root .
```

To actually create the scaffold files/folders (minimal set only):

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs scaffold \
  --repo-root . \
  --apply
```

> Default `--blueprint` is `init/project-blueprint.json`.

---

## Apply (recommended path)

From repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply \
  --repo-root . \
  --providers both
```

> Default `--blueprint` is `init/project-blueprint.json`.

### What `apply` does

1. Validates the blueprint (same as `validate`)
2. Optionally validates Stage A docs (when `--require-stage-a` is set)
3. Applies scaffold (idempotent; “write-if-missing” for docs)
4. Generates config files via `scripts/scaffold-configs.cjs`
5. Context system (core):
   - runs `node .ai/scripts/contextctl.js init`
   - runs `node .ai/scripts/projectctl.js init` and `set-context-mode`

   (These steps are performed unless the blueprint explicitly disables `addons.contextAwareness`.)
6. Enables skill packs:
   - If `.ai/scripts/skillsctl.js` exists: **scheme A** (packs enabled via skillsctl)
   - Else: additive update of `.ai/skills/_meta/sync-manifest.json` includePrefixes
7. Syncs provider wrappers via `.ai/scripts/sync-skills.cjs`
8. Runs modular core build (module-first consistency):
   - `node .ai/scripts/flowctl.js init`
   - `node .ai/scripts/integrationctl.js init`
   - `node .ai/scripts/modulectl.js registry-build`
   - `node .ai/scripts/flowctl.js update-from-manifests`
   - `node .ai/scripts/flowctl.js lint`
   - `node .ai/scripts/flowctl.js graph`
   - `node .ai/scripts/integrationctl.js validate`
   - `node .ai/scripts/contextctl.js build`

---

## DevOps scaffold (optional)

If the blueprint indicates CI/DevOps needs, Stage C scaffold will create an `ops/` convention structure:

- `ops/packaging/{services,jobs,apps,scripts,workdocs}/`
- `ops/deploy/{http_services,workloads,clients,scripts,workdocs}/`

These are provider-agnostic placeholders intended to be extended.

---

## User approval checkpoint (complete init)

After reviewing the resulting scaffold/configs/skills changes, record approval and mark init complete:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage C --repo-root .
```

Optional: remove `init/` bootstrap kit after completion:

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

This archives Stage A docs and Blueprint to `docs/project/` before deleting `init/`.

| Archive Option | Effect |
|----------------|--------|
| `--archive` | Archive all (Stage A docs + Blueprint) |
| `--archive-docs` | Archive Stage A docs only |
| `--archive-blueprint` | Archive Blueprint only |
