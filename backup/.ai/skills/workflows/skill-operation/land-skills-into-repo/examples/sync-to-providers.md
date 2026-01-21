# Example: SSOT sync to provider roots

## Scenario
Your repo keeps skills in `.ai/skills/` but you also want the same skills discoverable under:
- `.codex/skills/` (Codex)
- `.claude/skills/` (Claude Code)

## Commands
```bash
# Plan the sync (no writes)
python scripts/land_skills.py --repo-root . --sync codex,claude --plan

# Apply the sync
python scripts/land_skills.py --repo-root . --sync codex,claude --apply

# Verify provider roots too
python scripts/land_skills.py --repo-root . --verify --verify-provider codex,claude
```
