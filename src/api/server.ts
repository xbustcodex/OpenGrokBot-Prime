/**
 * Hono API — orchestrator, approvals, memory, agents, health.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supervisor } from "../orchestrator/supervisor.js";
import { approvalGate } from "../approval/gate.js";
import { memory } from "../memory/store.js";
import { modelRouter } from "../backends/router.js";
import { mcpHub } from "../mcp/client.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.join(__dirname, "../ui");

const app = new Hono();
app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "OpenGrokBot-Prime",
    freeModels: modelRouter.listFreeModels(),
  })
);

app.get("/", async (c) => {
  const { readFile } = await import("node:fs/promises");
  try {
    const html = await readFile(path.join(uiRoot, "index.html"), "utf8");
    return c.html(html);
  } catch {
    return c.text("UI not found — open src/ui/index.html", 404);
  }
});

app.get("/agents", (c) => c.json(supervisor.listAgents()));
app.get("/tasks", (c) => c.json(supervisor.listTasks()));
app.get("/conversation", (c) => c.json(supervisor.getConversation()));

app.post("/chat", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.message || body.text || "").trim();
  if (!text) return c.json({ error: "message required" }, 400);

  try {
    const result = await supervisor.runUserMessage(text);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/approvals", (c) => c.json(approvalGate.listPending()));

app.post("/approvals/:id/resolve", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const approved = Boolean(body.approved);
  const req = approvalGate.resolve(id, approved, body.resolvedBy || "api");
  if (!req) return c.json({ error: "not found or already resolved" }, 404);
  return c.json(req);
});

app.get("/memory/facts", (c) => {
  const q = c.req.query("q");
  if (q) return c.json(memory.searchFacts(q));
  return c.json(memory.listFacts());
});

app.post("/memory/facts", async (c) => {
  const body = await c.req.json();
  if (!body.key || body.value === undefined) {
    return c.json({ error: "key and value required" }, 400);
  }
  const fact = memory.upsertFact(body.key, String(body.value), body.source || "api");
  return c.json(fact);
});

app.get("/memory/blackboard", (c) => c.json(memory.getAllBlackboard()));

app.get("/mcp/tools", (c) => c.json(mcpHub.listTools()));

app.post("/mcp/call", async (c) => {
  const body = await c.req.json();
  try {
    const result = await mcpHub.callTool(body.name, body.arguments || {});
    return c.json({ result });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

const port = Number(process.env.PORT) || 8799;
const host = process.env.HOST || "127.0.0.1";

console.log(`OpenGrokBot-Prime API listening on http://${host}:${port}`);
serve({ fetch: app.fetch, port, hostname: host });
