/**
 * OpenCode CLI backend — free models only.
 *
 * Reality (Nov 2026): OpenCode free-tier models only work from within the
 * official OpenCode client/CLI. Direct HTTP calls to zen endpoints return
 * 403 FreeTierError for third-party clients. Therefore we shell out to the
 * `opencode` binary for free inference.
 *
 * Paid escalation is intentionally disabled. When every free model is
 * rate-limited or unavailable, we fail with a clear error instead of
 * silently spending money.
 */
import { spawn } from "node:child_process";
import { ModelCallOptions, ModelResponse } from "../types.js";

/** Live free roster snapshot (Nov 22–23 2026). Prefer env FREE_MODELS. */
const DEFAULT_FREE_MODELS = [
  "opencode/deepseek-v4.1-flash-free",
  "opencode/beam-free",
  "opencode/nemotron-3.5-lightning-free",
  "opencode/nemotron-3.5-super-vl-free",
  "opencode/mimo-v2.6-flash-free",
  "opencode/flint-40b-free",
  "opencode/big-pickle",
  "opencode/tidepool-alpha-free",
  "opencode/iceman-free",
  "opencode/hy4-flash-free",
];

function isFreeModelId(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower.includes("-free") ||
    lower.endsWith("/free") ||
    lower.includes("big-pickle") ||
    (lower.startsWith("opencode/") && (lower.includes("free") || lower.includes("big-pickle")))
  );
}

export class OpenCodeBackend {
  private freeModels: string[];
  private cliPath: string;
  private timeoutMs: number;
  private freeOnly: boolean;

  constructor(opts?: {
    freeModels?: string[];
    cliPath?: string;
    timeoutMs?: number;
    freeOnly?: boolean;
  }) {
    this.freeModels =
      opts?.freeModels ||
      (process.env.FREE_MODELS?.split(",").map((s) => s.trim()).filter(Boolean) ??
        DEFAULT_FREE_MODELS);
    this.cliPath = opts?.cliPath || process.env.OPENCODE_CLI || "opencode";
    this.timeoutMs = opts?.timeoutMs ?? Number(process.env.OPENCODE_TIMEOUT_MS) || 120_000;
    this.freeOnly =
      opts?.freeOnly ??
      (process.env.FREE_ONLY !== "0" && process.env.FREE_ONLY !== "false");
  }

  listFreeModels(): string[] {
    return [...this.freeModels];
  }

  isFreeOnly(): boolean {
    return this.freeOnly;
  }

  async chat(options: ModelCallOptions): Promise<ModelResponse> {
    const candidates: string[] = [];

    if (options.model) {
      if (this.freeOnly && !isFreeModelId(options.model)) {
        throw new Error(
          `FREE_ONLY is enabled: refused paid/non-free model "${options.model}". ` +
            `Use one of: ${this.freeModels.join(", ")}`
        );
      }
      candidates.push(options.model);
    } else {
      candidates.push(...this.freeModels);
    }

    const seen = new Set<string>();
    const ordered = candidates.filter((m) => {
      if (seen.has(m)) return false;
      seen.add(m);
      return true;
    });

    let lastError: Error | null = null;

    for (const model of ordered) {
      try {
        const res = await this.callCli(model, options);
        return res;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || "").toLowerCase();
        const isRateOrQuota =
          msg.includes("429") ||
          msg.includes("rate limit") ||
          msg.includes("free usage limit") ||
          msg.includes("free tier") ||
          msg.includes("quota") ||
          msg.includes("model unavailable") ||
          msg.includes("freetiererror");

        if (isRateOrQuota) {
          console.warn(`[OpenCode CLI] ${model} limited/unavailable, trying next free model…`);
          continue;
        }
        console.warn(`[OpenCode CLI] ${model} failed: ${err.message}`);
      }
    }

    throw (
      lastError ||
      new Error(
        "All free OpenCode models failed or are rate-limited. " +
          "FREE_ONLY is on — no paid escalation. Wait for quota reset or add more free models via FREE_MODELS."
      )
    );
  }

  private async callCli(model: string, options: ModelCallOptions): Promise<ModelResponse> {
    const system = options.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const userTurns = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");
    const prompt = [system && `SYSTEM:\n${system}`, userTurns].filter(Boolean).join("\n\n");

    const bareModel = model.replace(/^opencode\//, "");
    const modelArg = model.startsWith("opencode/") ? model : `opencode/${bareModel}`;
    const args = ["run", "--model", modelArg, prompt];

    return new Promise((resolve, reject) => {
      const child = spawn(this.cliPath, args, {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`OpenCode CLI timed out after ${this.timeoutMs}ms for ${model}`));
      }, this.timeoutMs);

      child.stdout?.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr?.on("data", (d) => {
        stderr += d.toString();
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        if ((err as any).code === "ENOENT") {
          reject(
            new Error(
              `OpenCode CLI not found at "${this.cliPath}". Install from https://opencode.ai or set OPENCODE_CLI.`
            )
          );
        } else {
          reject(err);
        }
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const combined = `${stdout}\n${stderr}`.trim();
        const lower = combined.toLowerCase();

        if (
          lower.includes("free usage limit") ||
          lower.includes("freetiererror") ||
          lower.includes("rate limit") ||
          lower.includes("429")
        ) {
          const err: any = new Error(combined.slice(0, 400) || `rate limited: ${model}`);
          err.status = 429;
          reject(err);
          return;
        }

        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.slice(0, 400) || `opencode exited ${code}`));
          return;
        }

        resolve({
          content: stdout.trim() || combined,
          model,
          usage: undefined,
          raw: { code, stderr: stderr.slice(0, 500) },
        });
      });
    });
  }

  async ping(): Promise<{ ok: boolean; version?: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn(this.cliPath, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      child.stdout?.on("data", (d) => (out += d.toString()));
      child.stderr?.on("data", (d) => (out += d.toString()));
      child.on("error", (err) => resolve({ ok: false, error: err.message }));
      child.on("close", (code) => {
        if (code === 0) resolve({ ok: true, version: out.trim() });
        else resolve({ ok: false, error: out.trim() || `exit ${code}` });
      });
    });
  }
}
