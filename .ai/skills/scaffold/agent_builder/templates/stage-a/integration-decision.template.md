# Stage A — Integration Decision (Temporary Workdir)

> This file MUST remain in the temporary agent_builder workdir and MUST NOT be committed to the repo.

This document is the **explicit user approval checkpoint** for scaffolding a **module-embedded agent component** and binding it into a real production workflow.

The goal is:
- Generate the agent under an existing module instance (`modules/<module_id>/...`).
- Bind the agent's primary interface to a business flow node in `.system/modular/flow_graph.yaml`.
- Keep flow graph changes separate: `agent_builder` does **not** edit `flow_graph.yaml`; it emits a `flow-change-request.md` when needed.

## 0) Host module binding (MUST be explicit)

- host_module_id:
- agent_subpath (default: `src/agents/<agent_id>`):
- docs_subpath (default: `workdocs/active/agent-<agent_id>`):
- interact_subpath (default: `interact/agents/<agent_id>`):

## 1) Business flow binding (MUST be explicit)

- flow_id:
- node_id:
- variant (optional):

If the flow/node do not exist yet, the correct sequence is:
1) update `.system/modular/flow_graph.yaml` (use the flow maintenance workflow)
2) rerun: `node .../agent-builder.js integrate-modular --workdir <WORKDIR> --apply`

## 2) Embedding point (MUST be explicit)

- Integration target kind:
- Integration target name:
- Concrete embedding point (file/function/route/job/step):
- Primary embedding: API (HTTP)
- Attach types enabled:
  - worker:
  - sdk:
  - cron:
  - pipeline:

## 3) Invocation semantics

### HTTP
- base_path:
- run route (fixed name: run):
- health route (fixed name: health):
- auth kind:
- degradation mode:

### Worker (if enabled)
- source kind + name:
- retry/backoff + idempotency:
- dead-letter / replay strategy:

### Cron (if enabled)
- schedule:
- input:
- output:

### Pipeline (if enabled)
- context:
- input/output channels:

### SDK (if enabled)
- language + package name:
- exported API name(s):

## 4) Failure contract (no suppression allowed)

- mode: propagate_error / return_fallback / enqueue_retry
- how errors are surfaced to upstream:
- rollback/disable method:
- kill switch env var: AGENT_ENABLED (required)

## 5) Data flow and compliance

- data classification:
- what is sent to LLM:
- storage/retention:
- redaction:

## 6) Approval

I confirm the above module binding, flow binding, and operational choices are correct and should be encoded into the blueprint.

- Approved by:
- Date:
