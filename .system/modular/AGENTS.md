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

- `node .ai/scripts/modulectl.mjs registry-build`
- `node .ai/scripts/flowctl.mjs update-from-manifests`
- `node .ai/scripts/flowctl.mjs lint`
- `node .ai/scripts/flowctl.mjs graph`
- `node .ai/scripts/integrationctl.mjs validate`
- `node .ai/scripts/integrationctl.mjs compile`
