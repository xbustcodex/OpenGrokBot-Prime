"""Small, auditable supervisor and pluggable inference interface.

This starter deliberately has no autonomous external tool execution. All agents
share the same backend interface and are called serially for predictable quotas.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol
from uuid import uuid4


class Backend(Protocol):
    async def complete(self, agent: str, prompt: str) -> str: ...


@dataclass(frozen=True)
class Handoff:
    agent: str
    prompt: str
    reply: str


@dataclass
class Supervisor:
    backend: Backend
    specialists: tuple[str, ...] = ("research", "review")
    history: list[Handoff] = field(default_factory=list)

    async def run(self, task: str) -> dict:
        if not task.strip():
            raise ValueError("Task cannot be empty")
        run_id = uuid4().hex
        handoffs: list[Handoff] = []
        for agent in self.specialists:
            prompt = f"Role: {agent}. Respond to this task without external actions: {task}"
            reply = await self.backend.complete(agent, prompt)
            handoff = Handoff(agent=agent, prompt=prompt, reply=reply)
            handoffs.append(handoff)
            self.history.append(handoff)
        summary = await self.backend.complete(
            "chief", "Summarize these specialist findings without inventing facts:\n"
            + "\n".join(f"{h.agent}: {h.reply}" for h in handoffs)
        )
        return {"run_id": run_id, "summary": summary,
                "handoffs": [{"agent": h.agent, "reply": h.reply} for h in handoffs]}
