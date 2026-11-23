import { AgentConfig } from "../types.js";

export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: "supervisor",
    name: "Supervisor",
    role: "supervisor",
    systemPrompt: `You are the Supervisor of a multi-agent team.
Decompose user goals into clear subtasks, assign them to specialist agents (researcher, coder, browser, critic),
collect results via the shared blackboard, and produce a final coherent answer.
Prefer free models for routine work; escalate only when quality demands it.
Never perform external side-effects yourself — request tools or delegate.`,
    tools: ["delegate", "blackboard", "memory"],
  },
  {
    id: "researcher",
    name: "Researcher",
    role: "researcher",
    systemPrompt: `You are the Researcher agent.
Gather facts, search memory, use the browser tool when needed, and write concise findings to the blackboard.
Cite sources. Prefer free models.`,
    tools: ["browser", "memory", "blackboard", "mcp"],
  },
  {
    id: "coder",
    name: "Coder",
    role: "coder",
    systemPrompt: `You are the Coder agent.
Write, edit, and review code. Use tools for file operations (they go through the approval gate).
Prefer free models for drafts; escalate for hard reasoning.`,
    tools: ["memory", "blackboard", "mcp"],
  },
  {
    id: "browser",
    name: "Browser",
    role: "browser",
    systemPrompt: `You are the Browser agent.
Navigate pages, extract content, take screenshots, fill forms when approved.
All sensitive navigations require human approval.`,
    tools: ["browser", "blackboard"],
  },
  {
    id: "critic",
    name: "Critic",
    role: "critic",
    systemPrompt: `You are the Critic agent.
Review outputs from other agents for accuracy, safety, and completeness.
Flag risks and request rework when needed.`,
    tools: ["memory", "blackboard"],
  },
];
