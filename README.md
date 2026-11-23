# OpenGrokBot-Prime

**Open-source Grok Bot alternative** — multi-agent orchestration with OpenCode free-model routing, MCP, browser automation, persistent memory, hard approval controls, and a desktop/web UI.

OpenCode is **one model/agent backend**, not the entire foundation. You can switch between OpenCode (free + paid), OpenRouter, OpenAI, Anthropic, and local models without redesigning the bot.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

## Features

- **Native multi-agent** — supervisor + researcher / coder / browser / critic with shared blackboard and task hand-off
- **OpenCode free-model router** — automatic 429 / quota failover across free Zen models, then escalate
- **Browser automation** — Playwright sandbox; sensitive domains go through the approval gate
- **MCP client hub** — register any MCP server; tools available to agents
- **Persistent memory** — SQLite facts + blackboard; vector store ready to plug in
- **Hard approvals** — file writes, commits, sends, deletes, purchases, sensitive network require explicit UI approval + full audit log
- **API + web UI + Electron shell**
- **Docker Compose** one-liner

## Quick start

### Local (Node 20+)

```bash
git clone https://github.com/xbustcodex/OpenGrokBot-Prime.git
cd OpenGrokBot-Prime
cp .env.example .env
npm install
npx playwright install chromium   # first time only
npm run server
```

Open http://127.0.0.1:8799 (UI + API). Or use the API directly:

```bash
curl -s http://127.0.0.1:8799/chat -H 'Content-Type: application/json' \
  -d '{"message":"Summarize what OpenGrokBot-Prime is"}' | jq
```

### Docker

```bash
cp .env.example .env
docker compose up -d --build
curl -s http://127.0.0.1:8799/health
```

### Desktop (Electron)

```bash
# API must be running on :8799
npm run desktop
```

## Architecture

```
Desktop (Electron) / Web UI
        ↕
API / Orchestrator (Hono)
  ├── Multi-agent supervisor + specialists
  ├── Model router (OpenCode free → escalate | OpenRouter | OpenAI | Anthropic | local)
  ├── Browser sandbox (Playwright)
  ├── MCP client hub
  ├── Memory (SQLite facts + blackboard)
  └── Approval + audit service
```

See [AGENTS.md](AGENTS.md) for roster, routing policy, and approval rules.

## Environment

Copy `.env.example` → `.env`. Important variables:

| Variable | Purpose |
|----------|---------|
| `OPENCODE_BASE_URL` | OpenCode Zen gateway (default public) |
| `FREE_MODELS` | Comma-separated free model ids |
| `ESCALATE_MODEL` | Fallback when free pool fails |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Paid backends |
| `REQUIRE_APPROVAL_FOR` | Actions that need human approval |
| `MEMORY_DB_PATH` | SQLite path |

## Verified landscape (context)

This project was designed after verifying popular open Grok-Bot-style repos (stars approximate, Nov 2026):

| Project | Stars | License | Notes |
|---------|-------|---------|-------|
| milind-soni/OpenMausBot | ~27k | Apache-2.0 (open-core) | Strong computer/VM + multi-agent chat |
| HarnessMD/munder-difflin | ~9–10k | MIT | OpenCode + multi-CLI office harness |
| elie222/rakazo | ~9.5k | Apache-2.0 | Closest full feature match |
| leepokai/Codync | ~2.4k | Apache-2.0 | Agent-agnostic ACP |
| najmuzzaman-mohammad/gawkbot | ~1.6–2k | Sustainable Use | Approvals + microapps |

OpenGrokBot-Prime deliberately keeps **OpenCode as a pluggable backend** and focuses on a clean, self-hosted control plane you own.

## Roadmap

- [x] OpenCode free-model router + failover
- [x] Multi-agent supervisor + specialists
- [x] Playwright browser tool
- [x] MCP client stub + hub
- [x] SQLite memory + blackboard
- [x] Approval gate + audit log
- [x] Hono API + web UI + Electron shell
- [x] Docker Compose
- [ ] Full MCP JSON-RPC stdio/SSE
- [ ] Vector memory (LanceDB / Chroma)
- [ ] Per-agent Docker desktop sandboxes
- [ ] Mobile client

## License

Apache-2.0 — see [LICENSE](LICENSE).
