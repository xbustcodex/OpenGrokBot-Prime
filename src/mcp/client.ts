/**
 * Hardened MCP client hub.
 *
 * Security controls (2026 best practices):
 * - Tool namespacing (server__tool) to prevent shadow declarations
 * - Strict argument schema validation (additionalProperties: false where possible)
 * - Destructive / open-world tools require approval gate
 * - No shell string concatenation — spawn with argument arrays only
 * - Audit log for every tools/call
 * - Allowlist of registered servers; unknown tools rejected
 * - Optional cwd / env isolation per server
 */
import { spawn, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { approvalGate } from "../approval/gate.js";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  destructive?: boolean;
  openWorld?: boolean;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  requireApproval?: string[];
  maxConcurrent?: number;
}

export class McpClient extends EventEmitter {
  private servers = new Map<
    string,
    { proc: ChildProcess; tools: McpTool[]; config: McpServerConfig; inflight: number }
  >();
  private tools = new Map<string, { server: string; tool: McpTool }>();
  private auditPath: string;
  private allowedServers: Set<string> | null = null;

  constructor() {
    super();
    this.auditPath = process.env.MCP_AUDIT_LOG || process.env.AUDIT_LOG_PATH || "./data/mcp-audit.log";
    fs.mkdirSync(path.dirname(this.auditPath), { recursive: true });
    const allow = process.env.MCP_ALLOWED_SERVERS?.split(",").map((s) => s.trim()).filter(Boolean);
    if (allow?.length) this.allowedServers = new Set(allow);
  }

  private audit(event: string, detail: Record<string, unknown>) {
    const line = JSON.stringify({ ts: new Date().toISOString(), event, ...detail }) + "\n";
    try {
      fs.appendFileSync(this.auditPath, line);
    } catch {
      /* ignore */
    }
  }

  async connect(config: McpServerConfig): Promise<McpTool[]> {
    if (this.allowedServers && !this.allowedServers.has(config.name)) {
      throw new Error(`MCP server "${config.name}" is not in MCP_ALLOWED_SERVERS allowlist`);
    }
    if (this.servers.has(config.name)) {
      return this.servers.get(config.name)!.tools;
    }

    if (/[;&|`$]/.test(config.command)) {
      throw new Error(`Refusing MCP command with shell metacharacters: ${config.command}`);
    }

    const proc = spawn(config.command, config.args || [], {
      env: { ...process.env, ...config.env },
      cwd: config.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const tools: McpTool[] = [
      {
        name: `${config.name}__ping`,
        description: `Health check for MCP server ${config.name}`,
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: `${config.name}__echo`,
        description: `Echo a short string (max 200 chars) — safe test tool`,
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", maxLength: 200 } },
          required: ["text"],
          additionalProperties: false,
        },
      },
    ];

    this.servers.set(config.name, { proc, tools, config, inflight: 0 });
    for (const t of tools) {
      this.tools.set(t.name, { server: config.name, tool: t });
    }

    proc.on("exit", (code) => {
      this.audit("server_exit", { server: config.name, code });
      this.servers.delete(config.name);
      for (const [name, meta] of this.tools) {
        if (meta.server === config.name) this.tools.delete(name);
      }
    });

    proc.stderr?.on("data", (d) => {
      this.audit("server_stderr", { server: config.name, chunk: d.toString().slice(0, 500) });
    });

    this.audit("server_connect", { server: config.name, command: config.command });
    return tools;
  }

  listTools(): McpTool[] {
    return [...this.tools.values()].map((t) => t.tool);
  }

  listServers(): string[] {
    return [...this.servers.keys()];
  }

  private validateArgs(schema: Record<string, unknown> | undefined, args: Record<string, unknown>): void {
    if (!schema || schema.type !== "object") return;
    const props = (schema.properties || {}) as Record<string, any>;
    const required = (schema.required || []) as string[];
    const additional = schema.additionalProperties;

    for (const key of required) {
      if (!(key in args)) throw new Error(`Missing required argument: ${key}`);
    }
    if (additional === false) {
      for (const key of Object.keys(args)) {
        if (!(key in props)) throw new Error(`Unexpected argument: ${key}`);
      }
    }
    for (const [key, val] of Object.entries(args)) {
      const p = props[key];
      if (!p) continue;
      if (p.type === "string" && typeof val !== "string") {
        throw new Error(`Argument ${key} must be string`);
      }
      if (p.type === "string" && typeof p.maxLength === "number" && String(val).length > p.maxLength) {
        throw new Error(`Argument ${key} exceeds maxLength ${p.maxLength}`);
      }
      if (p.type === "number" && typeof val !== "number") {
        throw new Error(`Argument ${key} must be number`);
      }
      if (p.pattern && typeof val === "string") {
        const re = new RegExp(p.pattern);
        if (!re.test(val)) throw new Error(`Argument ${key} failed pattern ${p.pattern}`);
      }
    }
  }

  private isDestructive(tool: McpTool, serverConfig: McpServerConfig): boolean {
    if (tool.destructive || tool.openWorld) return true;
    const name = tool.name.split("__").pop() || tool.name;
    if (serverConfig.requireApproval?.includes(name) || serverConfig.requireApproval?.includes(tool.name)) {
      return true;
    }
    return /write|delete|remove|send|post|exec|run|shell|purchase|commit|deploy/i.test(tool.name);
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const meta = this.tools.get(name);
    if (!meta) {
      this.audit("tool_unknown", { name, args });
      throw new Error(`Unknown MCP tool: ${name}`);
    }

    const server = this.servers.get(meta.server);
    if (!server) throw new Error(`MCP server not connected: ${meta.server}`);

    const max = server.config.maxConcurrent ?? 4;
    if (server.inflight >= max) {
      throw new Error(`MCP server ${meta.server} at concurrency limit (${max})`);
    }

    this.validateArgs(meta.tool.inputSchema, args);

    if (this.isDestructive(meta.tool, server.config)) {
      const ok = await approvalGate.request(
        "mcp_tool",
        `MCP tool ${name}`,
        { tool: name, args },
        "high"
      );
      if (!ok) {
        this.audit("tool_denied", { name, args });
        throw new Error(`Approval denied for MCP tool ${name}`);
      }
    }

    server.inflight++;
    this.audit("tool_call", { name, args, server: meta.server });

    try {
      if (name.endsWith("__ping")) {
        return { ok: true, server: meta.server, ts: Date.now() };
      }
      if (name.endsWith("__echo")) {
        return { echo: String(args.text ?? "").slice(0, 200) };
      }

      return {
        ok: false,
        error: "Full JSON-RPC tools/call not yet wired; use built-in tools or extend McpClient",
        name,
        args,
      };
    } finally {
      server.inflight--;
    }
  }

  async disconnectAll() {
    for (const [name, { proc }] of this.servers) {
      proc.kill();
      this.audit("server_disconnect", { server: name });
    }
    this.servers.clear();
    this.tools.clear();
  }
}

export const mcpHub = new McpClient();
