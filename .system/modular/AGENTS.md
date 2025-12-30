# Modular System SSOT

This directory contains the **SSOT** for the repository's modular development system.

## SSOT files

- `flow_graph.yaml` - business flows and nodes (SSOT)
- `flow_bindings.yaml` - manual bindings for multi-implementation nodes (validated)
- `type_graph.yaml` - optional type/layer graph (validated)

## Derived artifacts (generated; may be overwritten)

- `instance_registry.yaml` - aggregated module registry (derived)
- `flow_impl_index.yaml` - aggregated flow implementation index (derived)
- `graphs/` - generated relationship graphs (derived)
- `reports/` - generated change reports (derived)

## Tooling

- `node .ai/scripts/modulectl.js registry-build`
- `node .ai/scripts/flowctl.js update-from-manifests`
- `node .ai/scripts/flowctl.js lint`
- `node .ai/scripts/flowctl.js graph`
- `node .ai/scripts/integrationctl.js validate`
- `node .ai/scripts/integrationctl.js compile`
