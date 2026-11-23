export type AgentRole = "supervisor" | "researcher" | "coder" | "browser" | "critic" | "general";

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  model?: string;
  systemPrompt: string;
  tools: string[];
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  agentId?: string;
  toolName?: string;
  toolCallId?: string;
  timestamp: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "waiting_approval" | "done" | "failed";
  assignedTo?: string;
  parentTaskId?: string;
  result?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApprovalRequest {
  id: string;
  action: string;
  description: string;
  payload: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  status: "pending" | "approved" | "denied" | "expired";
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface MemoryFact {
  id: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface BlackboardEntry {
  key: string;
  value: unknown;
  updatedBy: string;
  updatedAt: number;
}

export interface ModelCallOptions {
  model?: string;
  messages: { role: string; content: string }[];
  tools?: unknown[];
  temperature?: number;
  maxTokens?: number;
  preferFree?: boolean;
}

export interface ModelResponse {
  content: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  toolCalls?: { id: string; name: string; arguments: string }[];
  raw?: unknown;
}

export type BackendName = "opencode" | "openrouter" | "openai" | "anthropic" | "local";
