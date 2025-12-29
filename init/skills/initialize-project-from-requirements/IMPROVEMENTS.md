# Improvements summary (revised init kit)

This init kit is a revised, robustness-focused version of the enhanced init pipeline.

It addresses the known “1.4” issues by enforcing consistent single sources of truth (SSOT), eliminating schema drift, and tightening stage checkpoint discipline. It also introduces add-on compatibility (context awareness) and optional DevOps scaffolding conventions.

---

## Key improvements

### 1) Manifest schema alignment (no more `collections.current` drift)
- The pipeline writes **flat** manifest schema:

```json
{
  "version": 1,
  "includePrefixes": ["workflows/*", "..."],
  "includeSkills": [],
  "excludeSkills": []
}
```

- The pipeline **does not** use `collections.current` or any nested “current selection” structure.

### 2) Configuration generation SSOT
- All config generation is delegated to:

- `init/skills/initialize-project-from-requirements/scripts/scaffold-configs.cjs`

The pipeline no longer duplicates config-generation logic in multiple locations.

### 3) Explicit stage approvals (no manual state edits)
- Stage validations update `init/.init-state.json`
- Stage transitions require explicit approval via:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage <A|B|C>
```

The `advance` command now only prints “what to do next” and does not mutate state.

### 4) Core context compatibility

In the module-first template, **context is core** and already present in the repository.

- The init pipeline should treat context as enabled by default.
- The blueprint flag `addons.contextAwareness: false` can be used to skip context-related init steps, but no files are installed from `addons/context-awareness` in this template version.

### 5) Pack enabling robustness
- If `.ai/scripts/skillsctl.js` exists, pack enabling uses **skillsctl scheme A** (`enable-pack ... --no-sync`) and performs a pack-file preflight:
  - `.ai/skills/_meta/packs/<packId>.json` must exist
- Otherwise, the pipeline falls back to a safe, additive update of `includePrefixes`

### 6) DevOps scaffolding (optional)
- Stage C scaffold can create a conventional `ops/` structure aligned with `init/stages/03-stage-c-scaffold-and-skills.md`:
  - `ops/packaging/{services,jobs,apps,scripts,workdocs}/`
  - `ops/deploy/{http_services,workloads,clients,scripts,workdocs}/`

---

## Notable behavior changes

- The pipeline no longer instructs users/agents to hand-edit state files to advance stages.
- The pipeline’s docs and examples use the canonical script path:
  - `node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs ...`
- Add-on installation is non-destructive (copy-if-missing) by design; upgrades require deliberate review.
