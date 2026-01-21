# Integration scenarios

Use `modules/integration/scenarios.yaml` to define end-to-end scenarios.

Typical loop:

1. Define/adjust business flow in `.system/modular/flow_graph.yaml`.
2. Implement endpoints and map them in `modules/*/MANIFEST.yaml`.
3. Regenerate derived registries:
   - `node .ai/scripts/modulectl.mjs registry-build`
   - `node .ai/scripts/flowctl.mjs update-from-manifests`
4. Create or update scenarios.
5. `node .ai/scripts/integrationctl.mjs validate`
6. `node .ai/scripts/integrationctl.mjs compile`
7. `node .ai/scripts/integrationctl.mjs run --scenario <id>` (when runtime endpoints are configured)
