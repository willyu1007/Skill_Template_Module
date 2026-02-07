# Reference: initialize-project-from-requirements

> **SSOT for workflow**: See `SKILL.md` for the complete command reference and workflow.
> This file contains implementation details and reference data.

---

## Key conclusions

- Stage A quality is enforced by **structure + placeholder checks** (`check-docs`), not deep semantic evaluation.
- Stage B blueprint is the **machine-readable SSOT** for Stage C scaffold/config generation.
- Output language for init entry docs is stored in `init/_work/.init-state.json` (`outputLanguage`).
- Pack selection is explicit: declared in blueprint -> materialized to sync manifest -> synced to wrappers.
- Stage transitions require explicit approval (`approve`), not manual state edits.
- When `ctl-skillpacks.mjs` is available, pack enabling uses ctl-skillpacks; otherwise falls back to sync manifest.
- Optional **features** are materialized from templates under `.ai/skills/features/.../templates/`.

---

## Must-ask checklist keys (Stage A)

| Key | Topic |
|-----|-------|
| `terminologyAlignment` | Domain glossary alignment |
| `onePurpose` | Single core purpose |
| `userRoles` | Target users and roles |
| `mustRequirements` | Must-have requirements |
| `outOfScope` | Explicitly out of scope |
| `userJourneys` | Key user journeys |
| `constraints` | Technical/business constraints |
| `successMetrics` | Success metrics |

Usage:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
  --repo-root . --key <key> --asked --answered --written-to <path>
```

---

## Stage A validation details

`check-docs` verifies:
- Required files exist under `init/_work/stage-a-docs/`
- Required headings exist
- Template placeholders (`<name>`, `<bullets>`, etc.) are resolved
- HTML tags (`<details>`, `<summary>`) are allowed

---

## Stage C `apply` steps

1. Validate blueprint
2. Optional docs check (`--require-stage-a`)
3. Scaffold directories/files (write-if-missing)
4. Generate configs (`scaffold-configs.mjs`)
5. Materialize features (copy templates + run `ctl-*.mjs init`)
6. Enable packs (ctl-skillpacks or sync manifest)
7. Sync provider wrappers

Notes:
- Feature failures are **non-blocking** by default
- Use `--blocking-features` to fail-fast on errors
