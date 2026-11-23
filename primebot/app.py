"""Minimal local API. The /run endpoint is intentionally inference-only."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .backends import from_environment
from .runtime import Supervisor

app = FastAPI(title="OpenGrokBot-Prime", version="0.1.0")
supervisor = Supervisor(from_environment())


class RunRequest(BaseModel):
    task: str = Field(min_length=1, max_length=10_000)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "mode": "inference-only", "agents": ["chief", *supervisor.specialists]}


@app.post("/run")
async def run(req: RunRequest) -> dict:
    return await supervisor.run(req.task)
