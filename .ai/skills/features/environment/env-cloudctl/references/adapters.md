# Adapter model (why + how)

## Why adapters

Multi-environment + multi-cloud becomes unmanageable if you hardcode provider commands.

Instead:

- Maintain **spec** centrally (contract/values/secret refs/policy targets).
- Route at runtime to provider-specific adapters.

## What an adapter must provide

- `plan(desired, deployed) -> diff`
- `apply(desired) -> execution_log`
- `read_deployed() -> deployed_state`
- `verify(desired, deployed) -> pass/fail`
- `rotate(secret_ref) -> rotation_log` (optional)
- `decommission(env) -> log` (optional)

The bundled scripts ship:

- `mockcloud`: offline tests/demos (stores deployed state under `.ai/mock-cloud/<env>/state.json`)
- `envfile`: env-file injection with `local` or `ssh` transport
  - local deployed state cache: `.ai/.tmp/env-cloud/<env>/state.json`
  - ssh transport writes remote env-file + meta, optional pre/post commands
