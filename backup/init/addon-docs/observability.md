# Observability Add-on

## Conclusions (read first)

- Provides observability contracts for metrics, logs, traces
- Defines instrumentation standards (backend-agnostic)
- AI uses contracts to propose consistent observability

## How to enable

In `project-blueprint.json`:

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

## What gets installed

- `docs/context/observability/` - Observability contracts
  - `metrics-registry.json` - Metric definitions
  - `logs-schema.json` - Log field schema
  - `traces-config.json` - Tracing config
- `observability/` - Observability root
- `.ai/scripts/obsctl.js` - Observability management

## Commands

```bash
# Add a metric
node .ai/scripts/obsctl.js add-metric --name api_latency --type histogram --unit seconds

# Add a log field
node .ai/scripts/obsctl.js add-log-field --name correlation_id --type string

# Generate instrumentation hints
node .ai/scripts/obsctl.js generate-instrumentation --lang typescript

# Verify
node .ai/scripts/obsctl.js verify
```

## See also

- `addons/observability/ADDON.md` - Full documentation

