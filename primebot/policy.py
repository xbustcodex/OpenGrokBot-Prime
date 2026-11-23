"""Explicit side-effect approval decisions. Deny by default."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Action(str, Enum):
    READ_LOCAL = "read_local"
    READ_PUBLIC_WEB = "read_public_web"
    WRITE_FILE = "write_file"
    SEND_MESSAGE = "send_message"
    COMMIT = "commit"
    FINANCIAL = "financial"
    RUN_SHELL = "run_shell"


@dataclass(frozen=True)
class Decision:
    permitted: bool
    requires_approval: bool
    reason: str


def evaluate(action: Action, approved: bool = False) -> Decision:
    if action in (Action.READ_LOCAL, Action.READ_PUBLIC_WEB):
        return Decision(True, False, "Read-only operation")
    if not approved:
        return Decision(False, True, f"{action.value} requires explicit approval")
    return Decision(True, False, "Approved by operator")
