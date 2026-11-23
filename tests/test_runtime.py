import asyncio

from primebot.backends import EchoBackend
from primebot.policy import Action, evaluate
from primebot.runtime import Supervisor


def test_supervisor_three_turns():
    class Recorder(EchoBackend):
        def __init__(self):
            self.calls = []
        async def complete(self, agent, prompt):
            self.calls.append(agent)
            return f"{agent}:pass"
    backend = Recorder()
    result = asyncio.run(Supervisor(backend).run("ping"))
    assert backend.calls == ["research", "review", "chief"]
    assert len(result["handoffs"]) == 2
    assert result["summary"] == "chief:pass"


def test_policy_deny_by_default():
    assert evaluate(Action.SEND_MESSAGE).requires_approval
    assert not evaluate(Action.RUN_SHELL).permitted
    assert evaluate(Action.READ_LOCAL).permitted
    assert evaluate(Action.SEND_MESSAGE, approved=True).permitted
