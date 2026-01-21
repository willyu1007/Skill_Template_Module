# Adapter model (why + how)

## Why adapters

Multi-environment + multi-cloud becomes unmanageable if you hardcode provider commands.

Instead:

- Maintain **spec** centrally (contract/values/secret refs/inventory).
- Route at runtime to provider-specific adapters.

## What an adapter must provide

- `plan(desired, deployed) -> diff`
- `apply(desired) -> execution_log`
- `read_deployed() -> deployed_state`
- `verify(desired, deployed) -> pass/fail`
- `rotate(secret_ref) -> rotation_log` (optional)
- `decommission(env) -> log` (optional)

The bundled scripts ship only a `mockcloud` adapter for offline tests.
