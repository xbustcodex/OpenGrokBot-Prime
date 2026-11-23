/**
 * OpenCode adapter with free-model routing + automatic 429 failover.
 * OpenCode is ONE backend among others — not the foundation of the bot.
 */
import { ModelCallOptions, ModelResponse } from "../types.js";

const DEFAULT_FREE_MODELS = [
  "opencode/deepseek-v4.1-flash-free",
  "opencode/beam-free",
  "opencode/nemotron-3.5-lightning-free",
  "opencode/big-pickle",
  "opencode/nemotron-3.5-super-vl-free",
];

export class OpenCodeBackend {
  private baseUrl: string;
  private apiKey?: string;
  private freeModels: string[];
  private escalateModel: string;

  constructor(opts?: {
    baseUrl?: string;
    apiKey?: string;
    freeModels?: string[];
    escalateModel?: string;
  }) {
    this.baseUrl = opts?.baseUrl || process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1";
    this.apiKey = opts?.apiKey || process.env.OPENCODE_API_KEY;
    this.freeModels =
      opts?.freeModels ||
      (process.env.FREE_MODELS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_FREE_MODELS);
    this.escalateModel =
      opts?.escalateModel || process.env.ESCALATE_MODEL || "openrouter/anthropic/claude-sonnet-4";
  }

  /** Try free models in order; on 429 / rate-limit move to next; finally escalate. */
  async chat(options: ModelCallOptions): Promise<ModelResponse> {
    const preferFree = options.preferFree !== false;
    const candidates: string[] = [];

    if (options.model) {
      candidates.push(options.model);
    } else if (preferFree) {
      candidates.push(...this.freeModels);
    }

    if (preferFree && !candidates.includes(this.escalateModel)) {
      candidates.push(this.escalateModel);
    }

    let lastError: Error | null = null;

    for (const model of candidates) {
      try {
        const res = await this.callModel(model, options);
        return res;
      } catch (err: any) {
        lastError = err;
        const status = err?.status || err?.response?.status;
        const msg = String(err?.message || "").toLowerCase();
        const isRateLimit =
          status === 429 ||
          msg.includes("rate limit") ||
          msg.includes("429") ||
          msg.includes("quota") ||
          msg.includes("free usage limit");

        if (isRateLimit) {
          console.warn(`[OpenCode] ${model} rate-limited / quota, trying next…`);
          continue;
        }
        console.warn(`[OpenCode] ${model} failed: ${err.message}`);
      }
    }

    throw lastError || new Error("All OpenCode models failed");
  }

  private async callModel(model: string, options: ModelCallOptions): Promise<ModelResponse> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const body = {
      model: model.replace(/^opencode\//, ""),
      messages: options.messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4096,
      stream: false,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const err: any = new Error(`OpenCode ${model} → ${resp.status}: ${text.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }

    const data = (await resp.json()) as any;
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";
    const toolCalls = choice?.message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: tc.function?.arguments,
    }));

    return {
      content,
      model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
      toolCalls,
      raw: data,
    };
  }

  listFreeModels(): string[] {
    return [...this.freeModels];
  }
}
