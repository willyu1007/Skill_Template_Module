# CI Configuration - AI Guidance

## Conclusions (read first)

- CI configuration is managed via `cictl.js`.
- Do NOT edit workflow files directly; use `cictl generate` to regenerate.
- Features are enabled/disabled in `ci/config.json`.

## Workflow

1. Enable features: `node .ai/scripts/cictl.js enable-feature <feature>`
2. Generate workflows: `node .ai/scripts/cictl.js generate`
3. Commit the generated files

## Available Features

- `lint` - Code linting
- `test` - Test execution
- `build` - Build step
- `security` - Security scanning
- `release` - Release automation
- `deploy` - Deployment triggers

## Supported Platforms

- `github-actions` - GitHub Actions (default)
- `gitlab-ci` - GitLab CI

## Common Tasks

### Add a new CI feature

```bash
node .ai/scripts/cictl.js enable-feature security
node .ai/scripts/cictl.js generate
```

### Switch CI platform

```bash
node .ai/scripts/cictl.js init --platform gitlab-ci
node .ai/scripts/cictl.js generate
```

### Check CI status

```bash
node .ai/scripts/cictl.js status
node .ai/scripts/cictl.js verify
```

