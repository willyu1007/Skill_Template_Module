# Observability (LLM-first)

## Commands

```bash
node .ai/skills/features/observability/scripts/obsctl.mjs init
node .ai/skills/features/observability/scripts/obsctl.mjs add-metric --name http_requests_total --type counter
node .ai/skills/features/observability/scripts/obsctl.mjs list-metrics
node .ai/skills/features/observability/scripts/obsctl.mjs verify
```

## Directory Structure

- `observability/config.json` - Configuration
- `observability/workdocs/alert-runbooks/` - Alert runbooks
- `docs/context/observability/` - Metrics/logs/traces contracts

## Metric Types

- counter: Monotonically increasing value
- gauge: Value that can go up or down
- histogram: Distribution of values
