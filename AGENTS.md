# OpenGrokBot-Prime — Agents & Policy

## Roster

| Agent | Role | Tools |
|-------|------|-------|
| Supervisor | Plan, delegate, synthesize | delegate, blackboard, memory |
| Researcher | Facts, search, memory | browser, memory, blackboard, mcp |
| Coder | Code write/review | memory, blackboard, mcp |
| Browser | Navigate, extract | browser, blackboard |
| Critic | Review accuracy/safety | memory, blackboard |

## Model routing (FREE_ONLY default)

- Inference goes through the **OpenCode CLI** (`opencode run --model …`).
- Free Zen models are **CLI-only** (HTTP third-party clients get 403).
- `FREE_ONLY=1` (default): **no paid escalation**. On 429/quota the router tries the next free model, then fails.
- Set `FREE_ONLY=0` only if you intentionally want OpenRouter/OpenAI/Anthropic fallbacks.

Free model candidates (Nov 2026 snapshot — verify with `opencode models`):

- `opencode/deepseek-v4.1-flash-free`
- `opencode/beam-free`
- `opencode/nemotron-3.5-lightning-free` / `opencode/nemotron-3.5-super-vl-free`
- `opencode/mimo-v2.6-flash-free`
- `opencode/flint-40b-free`
- `opencode/big-pickle`
- `opencode/tidepool-alpha-free` / `opencode/iceman-free` / `opencode/hy4-flash-free`

## Approval policy

Actions in `REQUIRE_APPROVAL_FOR` (default includes `mcp_tool`, `file_write`, `commit`, `send`, `delete`, `purchase`, `network_sensitive`) block until a human resolves them via `/approvals/:id/resolve` or the UI.

## MCP security

- Tools are namespaced `server__tool`.
- Arguments validated against schema (`additionalProperties: false` where declared).
- Destructive / open-world tools always hit the approval gate.
- Spawn uses argument arrays only (no shell).
- Every call is appended to `MCP_AUDIT_LOG`.
- Optional `MCP_ALLOWED_SERVERS` allowlist.
