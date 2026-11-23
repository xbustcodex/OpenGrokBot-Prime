# OpenGrokBot-Prime

Local-first, **early working foundation** for a modular Grok Bot alternative. OpenCode is intended as one of several interchangeable agent backends, not the orchestrator itself.

## What exists in this branch

- FastAPI `/health` and `/run` endpoints
- Sequential supervisor calling two specialist agents and Chief
- Offline echo backend for deterministic tests, plus OpenAI-compatible inference adapter
- Deny-by-default side-effect *policy decisions* (not a complete approval broker)
- Two basic unit tests and a Docker Compose configuration bound to localhost

**Not implemented yet:** OpenCode CLI adapter, real MCP broker, Playwright sandbox, durable memory, approval UI, desktop shell, automatic model failover, and live multi-agent permissions. None should be represented as operational.

## Run locally

```powershell
python -m pip install -e ".[test]"
python -m pytest
python -m uvicorn primebot.app:app --host 127.0.0.1 --port 8080
```

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
Invoke-RestMethod http://127.0.0.1:8080/run -Method Post -ContentType 'application/json' -Body '{"task":"Test the supervisor"}'
```

Or run `docker compose up --build`. Defaults to offline deterministic inference. For a provider **you are authorized to call directly**, configure the example environment variables and `PRIMEBOT_BACKEND=openai`.

No financial, network automation, shell, publishing or filesystem mutation tools are exposed to agents in this version.
