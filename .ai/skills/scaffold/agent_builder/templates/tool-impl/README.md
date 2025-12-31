# Tool Implementation Templates

This directory contains template patterns for implementing different types of tools.

## Available Templates

| Template | Use Case |
|----------|----------|
| `http_api.js.template` | REST API integrations |
| `database.js.template` | Database query tools |
| `mcp_server.js.template` | MCP protocol tools |
| `filesystem.js.template` | File system operations |
| `internal_service.js.template` | Internal service calls |

## Usage

During Stage D implementation, use these templates as starting points for tool implementations. Replace placeholder variables with actual values from the blueprint.

## Template Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `{{tool_id}}` | `tools.tools[].id` | Tool identifier |
| `{{tool_base_url_env}}` | `tools.tools[].auth.base_url_env` | Env var for base URL |
| `{{tool_api_key_env}}` | `tools.tools[].auth.env_var` | Env var for API key |
| `{{timeout_ms}}` | `tools.tools[].timeouts.timeout_ms` | Request timeout |
| `{{max_attempts}}` | `tools.tools[].retry.max_attempts` | Max retry attempts |
| `{{backoff}}` | `tools.tools[].retry.backoff` | Backoff strategy |

