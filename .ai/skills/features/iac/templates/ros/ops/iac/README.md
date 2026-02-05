# IaC (Infrastructure as Code)

This folder is the **IaC SSOT** for this repository.

Rules:
- Use exactly **one** IaC tool per project (no dual SSOT).
- Do not store secrets in IaC code or `docs/context/iac/*`.

Selected tool: **ROS** (`ops/iac/ros/`) — Alibaba Cloud Resource Orchestration Service templates.

## Structure

- `ops/iac/handbook/` — decisions, runbooks, and apply logs
- `ops/iac/ros/` — ROS template SSOT

## Context-Awareness

The IaC feature generates:
- `docs/context/iac/overview.json` (generated; no secrets)

and registers it in:
- `docs/context/project.registry.json` (`artifactId: iac.overview`)

