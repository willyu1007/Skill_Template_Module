# Release Management - AI Guidance

## Conclusions (read first)

- Use `releasectl.js` for all release operations.
- AI proposes releases; humans approve and execute.
- Follow the configured versioning strategy.

## Workflow

1. **Prepare** release: `node .ai/scripts/releasectl.js prepare --version <version>`
2. **Generate** changelog: `node .ai/scripts/releasectl.js changelog`
3. **Request human** approval
4. **Tag** release: `node .ai/scripts/releasectl.js tag --version <version>`

## Version Strategies

| Strategy | Format | Example |
|----------|--------|---------|
| semantic | major.minor.patch | 1.2.3 |
| calendar | YYYY.MM.DD | 2024.01.15 |
| manual | custom | any |

## Semantic Versioning Guidelines

- **Major**: Breaking changes
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes (backward compatible)

## Commands Reference

```bash
# Check status
node .ai/scripts/releasectl.js status

# Prepare release
node .ai/scripts/releasectl.js prepare --version 1.2.0

# Generate changelog
node .ai/scripts/releasectl.js changelog

# Create tag
node .ai/scripts/releasectl.js tag --version 1.2.0
```

## Forbidden Actions

- Direct version bumps without changelog
- Skipping release approval
- Tagging without verification
- Manual git tag creation (use releasectl)

