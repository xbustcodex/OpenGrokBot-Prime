# AGENTS.md — OpenGrokBot-Prime

This file defines the agent roster, routing policy, and approval rules used by the orchestrator.

## Roster

| ID | Role | Responsibility |
|----|------|----------------|
| supervisor | Orchestrator | Decompose goals, delegate, synthesize final answer |
| researcher | Specialist | Facts, memory search, light web research |
| coder | Specialist | Code write/review (file ops go through approval) |
| browser | Specialist | Playwright navigation, extraction, screenshots |
| critic | Specialist | Review specialist outputs for quality & safety |

## Model routing policy

1. **Default backend**: OpenCode free-model pool (rotate on 429).
2. **Escalation**: When free models fail or quality is insufficient → configured paid model (OpenRouter / Anthropic / OpenAI).
3. **OpenCode is one backend**, not the foundation. The router can switch to OpenRouter, OpenAI, Anthropic, or local (Ollama) without redesign.
4. Specialists prefer free models; supervisor may escalate for final synthesis when needed.

Free model candidates (check live OpenCode Zen catalog):

- `opencode/deepseek-v4.1-flash-free`
- `opencode/beam-free`
- `opencode/nemotron-3.5-lightning-free`
- `opencode/big-pickle`
- `opencode/nemotron-3.5-super-vl-free`

## Approval policy

These actions **always** require explicit human approval (UI card + audit log):

- `file_write` — writes outside the agent sandbox
- `network_sensitive` — banks, payment, admin, login domains
- `commit` — git commits / pushes
- `send` — email, chat, social posts
- `delete` — destructive file or data ops
- `purchase` — any spend
- `shell_dangerous` — destructive shell commands

Timeout defaults to 5 minutes; expired requests are treated as denied.

## Blackboard & memory

- Shared **blackboard** (key/value) for inter-agent hand-off.
- **Structured facts** stored in SQLite with source + confidence.
- After significant turns, extract durable facts (preferences, project names, decisions).

## MCP

Register any MCP server via the hub. Tools appear as `{server}.{tool}` and are available to agents that list `mcp` in their tool set.

## Safety

- Bots never type passwords.
- CAPTCHA / 2FA / login walls hand control back to the human.
- All approval decisions are written to the audit log.
