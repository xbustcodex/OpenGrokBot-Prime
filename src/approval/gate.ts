/**
 * Hard approval policy layer.
 * Every external action (file write outside sandbox, sensitive network, commit, send, delete, purchase)
 * requires explicit human approval via a clean UI card. Everything is audited.
 */
import { v4 as uuid } from "uuid";
import fs from "node:fs";
import path from "node:path";
import { ApprovalRequest } from "../types.js";

const DEFAULT_REQUIRE = new Set([
  "file_write",
  "network_sensitive",
  "commit",
  "send",
  "delete",
  "purchase",
  "shell_dangerous",
  "mcp_tool",
]);

export class ApprovalGate {
  private pending = new Map<string, ApprovalRequest>();
  private auditPath: string;
  private require: Set<string>;
  private timeoutMs: number;
  private waiters = new Map<string, { resolve: (ok: boolean) => void; timer: NodeJS.Timeout }>();

  constructor() {
    this.auditPath = process.env.AUDIT_LOG_PATH || "./data/audit.log";
    fs.mkdirSync(path.dirname(this.auditPath), { recursive: true });
    const fromEnv = process.env.REQUIRE_APPROVAL_FOR?.split(",").map((s) => s.trim()).filter(Boolean);
    this.require = new Set(fromEnv?.length ? fromEnv : DEFAULT_REQUIRE);
    this.timeoutMs = Number(process.env.APPROVAL_TIMEOUT_MS) || 300_000;
  }

  needsApproval(action: string): boolean {
    return this.require.has(action);
  }

  async request(
    action: string,
    description: string,
    payload: Record<string, unknown> = {},
    risk: "low" | "medium" | "high" = "medium"
  ): Promise<boolean> {
    if (!this.needsApproval(action)) {
      this.audit("auto_allowed", action, description, payload);
      return true;
    }

    const id = uuid();
    const req: ApprovalRequest = {
      id,
      action,
      description,
      payload,
      risk,
      status: "pending",
      createdAt: Date.now(),
    };
    this.pending.set(id, req);
    this.audit("requested", action, description, { id, ...payload });

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const r = this.pending.get(id);
        if (r && r.status === "pending") {
          r.status = "expired";
          r.resolvedAt = Date.now();
          this.pending.set(id, r);
          this.audit("expired", action, description, { id });
        }
        this.waiters.delete(id);
        resolve(false);
      }, this.timeoutMs);

      this.waiters.set(id, { resolve, timer });
    });
  }

  resolve(id: string, approved: boolean, resolvedBy = "user"): ApprovalRequest | null {
    const req = this.pending.get(id);
    if (!req || req.status !== "pending") return null;

    req.status = approved ? "approved" : "denied";
    req.resolvedAt = Date.now();
    req.resolvedBy = resolvedBy;
    this.pending.set(id, req);

    const waiter = this.waiters.get(id);
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(approved);
      this.waiters.delete(id);
    }

    this.audit(approved ? "approved" : "denied", req.action, req.description, {
      id,
      resolvedBy,
    });
    return req;
  }

  listPending(): ApprovalRequest[] {
    return [...this.pending.values()].filter((r) => r.status === "pending");
  }

  get(id: string): ApprovalRequest | undefined {
    return this.pending.get(id);
  }

  private audit(event: string, action: string, description: string, extra: Record<string, unknown> = {}) {
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event,
        action,
        description,
        ...extra,
      }) + "\n";
    fs.appendFileSync(this.auditPath, line, "utf8");
  }
}

export const approvalGate = new ApprovalGate();
