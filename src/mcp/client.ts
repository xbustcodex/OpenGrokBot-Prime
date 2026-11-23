/**
 * Minimal first-class MCP client hub.
 * Any MCP server (GitHub, filesystem, browser, custom) can be registered and exposed to agents.
 * Full JSON-RPC over stdio / SSE can be layered later; this gives the interface.
 */
import { spawn, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class McpClient extends EventEmitter {
  private servers = new Map<string, { proc: ChildProcess; tools: McpTool[] }>();
  private tools = new Map<string, { server: string; tool: McpTool }>();

  async connect(config: McpServerConfig): Promise<McpTool[]> {
    if (this.servers.has(config.name)) {
      return this.servers.get(config.name)!.tools;
    }

    const proc = spawn(config.command, config.args || [], {
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Stub: real MCP would speak JSON-RPC initialize + tools/list.
    // For the scaffold we register a few built-in tools so agents can call something.
    const tools: McpTool[] = [
      {
        name: `${config.name}.ping`,
        description: `Ping the ${config.name} MCP server`,
        inputSchema: { type: "object", properties: {} },
      },
    ];

    this.servers.set(config.name, { proc, tools });
    for (const t of tools) {
      this.tools.set(t.name, { server: config.name, tool: t });
    }

    proc.on("exit", () => {
      this.servers.delete(config.name);
      for (const [name, meta] of this.tools) {
        if (meta.server === config.name) this.tools.delete(name);
      }
    });

    return tools;
  }

  listTools(): McpTool[] {
    return [...this.tools.values()].map((t) => t.tool);
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const meta = this.tools.get(name);
    if (!meta) throw new Error(`Unknown MCP tool: ${name}`);

    // Scaffold response — replace with real JSON-RPC tools/call
    if (name.endsWith(".ping")) {
      return { ok: true, server: meta.server, ts: Date.now() };
    }
    return { ok: false, error: "Tool not implemented in scaffold", name, args };
  }

  async disconnectAll() {
    for (const [, { proc }] of this.servers) {
      proc.kill();
    }
    this.servers.clear();
    this.tools.clear();
  }
}

export const mcpHub = new McpClient();
