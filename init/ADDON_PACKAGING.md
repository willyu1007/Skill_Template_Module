# Packaging Add-on

## Conclusions (read first)

- Provides container/artifact packaging infrastructure
- Manages Dockerfiles, build scripts, artifact registry
- AI proposes configs; humans execute builds

## How to enable

In `project-blueprint.json`:

```json
{
  "addons": {
    "packaging": true
  },
  "packaging": {
    "enabled": true,
    "containerize": true,
    "targets": ["services", "jobs"]
  }
}
```

Then run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply --blueprint docs/project/project-blueprint.json
```

## What gets installed

- `ops/packaging/` - Packaging root
  - `ops/packaging/services/` - Service Dockerfiles
  - `ops/packaging/jobs/` - Job Dockerfiles
  - `ops/packaging/templates/` - Dockerfile templates
- `docs/packaging/registry.json` - Artifact registry
- `.ai/scripts/packctl.js` - Packaging management

## Commands

```bash
# Add a service
node .ai/scripts/packctl.js add-service --id api --module apps/backend

# Add a job
node .ai/scripts/packctl.js add-job --id cron-task

# List targets
node .ai/scripts/packctl.js list

# Verify
node .ai/scripts/packctl.js verify
```

## See also

- `addons/packaging/ADDON.md` - Full documentation

