"""OpenAI-compatible inference backend plus an offline deterministic test backend.

OpenCode CLI support belongs in a separate adapter after its permission and output
contracts are verified. No assumption of third-party free API entitlements is made.
"""
from __future__ import annotations

import json
import os
from urllib import request, error


class EchoBackend:
    async def complete(self, agent: str, prompt: str) -> str:
        return f"[offline test:{agent}] {prompt[:120]}"


class OpenAICompatibleBackend:
    def __init__(self, base_url: str, model: str, api_key: str = ""):
        if not base_url.startswith(("http://127.0.0.1:", "http://localhost:", "https://")):
            raise ValueError("Use HTTPS or loopback HTTP")
        self.endpoint = base_url.rstrip("/") + "/chat/completions"
        self.model = model
        self.api_key = api_key

    async def complete(self, agent: str, prompt: str) -> str:
        import asyncio
        return await asyncio.to_thread(self._request, agent, prompt)

    def _request(self, agent: str, prompt: str) -> str:
        body = json.dumps({"model": self.model, "messages": [
            {"role": "system", "content": f"You are the {agent} agent. Never claim tools were used unless they were."},
            {"role": "user", "content": prompt}], "stream": False}).encode()
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = "Bearer " + self.api_key
        req = request.Request(self.endpoint, data=body, headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read(2_000_000))
        except error.HTTPError as exc:
            raise RuntimeError(f"Provider HTTP {exc.code}") from exc
        return data["choices"][0]["message"]["content"]


def from_environment():
    if os.getenv("PRIMEBOT_BACKEND", "echo") == "echo":
        return EchoBackend()
    return OpenAICompatibleBackend(
        os.environ["PRIMEBOT_BASE_URL"],
        os.environ["PRIMEBOT_MODEL"],
        os.getenv("PRIMEBOT_API_KEY", ""),
    )
