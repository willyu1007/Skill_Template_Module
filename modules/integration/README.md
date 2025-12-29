# Integration scenarios

Use `modules/integration/scenarios.yaml` to define end-to-end scenarios.

Typical loop:

1. Define/adjust business flow in `.system/modular/flow_graph.yaml`.
2. Implement endpoints and map them in `modules/*/MANIFEST.yaml`.
3. Regenerate derived registries:
   - `node .ai/scripts/modulectl.js registry-build`
   - `node .ai/scripts/flowctl.js update-from-manifests`
4. Create or update scenarios.
5. `node .ai/scripts/integrationctl.js validate`
6. `node .ai/scripts/integrationctl.js run --scenario <id>` (when runtime endpoints are configured)
