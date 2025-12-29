# Observability Add-on (Optional)

## Conclusions (read first)

- This add-on provides **observability contracts** for metrics, logs, and traces.
- Defines instrumentation standards without coupling to specific backends.
- AI uses these contracts to propose consistent observability patterns.

## What this add-on writes (blast radius)

New files/directories (created if missing):

- `docs/context/observability/` (observability contracts)
  - `metrics-registry.json` - Metric definitions
  - `logs-schema.json` - Structured log schema
  - `traces-config.json` - Tracing configuration
- `observability/` (observability root)
  - `observability/AGENTS.md` (LLM guidance)
  - `observability/config.json` (observability configuration)
  - `observability/workdocs/` (observability planning)
- `.ai/scripts/obsctl.js` (observability management)
- `docs/addons/observability/` (add-on documentation)

## Install

### Option A: Via init-pipeline (recommended)

Enable in your `project-blueprint.json`:

```json
{
  "addons": {
    "observability": true
  },
  "observability": {
    "enabled": true,
    "metrics": true,
    "logs": true,
    "traces": true
  }
}
```

Then run:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply --blueprint docs/project/project-blueprint.json
```

### Option B: Install manually

1. Copy payload contents into the repository root.
2. Initialize observability:
   ```bash
   node .ai/scripts/obsctl.js init
   ```

## Usage

### Initialize Observability

```bash
node .ai/scripts/obsctl.js init
```

### Manage Metrics

```bash
# Add a metric
node .ai/scripts/obsctl.js add-metric --name request_duration --type histogram --unit seconds

# List metrics
node .ai/scripts/obsctl.js list-metrics
```

### Manage Log Fields

```bash
# Add a log field
node .ai/scripts/obsctl.js add-log-field --name user_id --type string

# List log fields
node .ai/scripts/obsctl.js list-log-fields
```

### Generate Instrumentation Hints

```bash
# Generate instrumentation code hints
node .ai/scripts/obsctl.js generate-instrumentation --lang typescript
```

## Observability Contracts

### Metrics Registry

`docs/context/observability/metrics-registry.json` defines:
- Metric name and type (counter, gauge, histogram)
- Units and labels
- Description and owner

### Logs Schema

`docs/context/observability/logs-schema.json` defines:
- Required log fields
- Field types and formats
- Log levels

### Traces Config

`docs/context/observability/traces-config.json` defines:
- Span naming conventions
- Attribute standards
- Sampling configuration

## Verification

```bash
# Verify observability configuration
node .ai/scripts/obsctl.js verify
```

## Rollback / Uninstall

Delete these paths:

- `docs/context/observability/`
- `observability/`
- `.ai/scripts/obsctl.js`
- `docs/addons/observability/`

