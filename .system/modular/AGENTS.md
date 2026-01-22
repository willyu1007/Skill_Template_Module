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

- `node .ai/scripts/modules/modulectl.mjs registry-build`
- `node .ai/scripts/modules/flowctl.mjs update-from-manifests`
- `node .ai/scripts/modules/flowctl.mjs lint`
- `node .ai/scripts/modules/flowctl.mjs graph`
- `node .ai/scripts/modules/integrationctl.mjs validate`
- `node .ai/scripts/modules/integrationctl.mjs compile`
