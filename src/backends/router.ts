/**
 * Model router — OpenCode is one backend among OpenRouter, OpenAI, Anthropic, local.
 */
import { OpenCodeBackend } from "./opencode.js";
import { ModelCallOptions, ModelResponse, BackendName } from "../types.js";

export class ModelRouter {
  private opencode: OpenCodeBackend;
  private defaultBackend: BackendName = "opencode";

  constructor() {
    this.opencode = new OpenCodeBackend();
  }

  async chat(options: ModelCallOptions & { backend?: BackendName }): Promise<ModelResponse> {
    const backend = options.backend || this.pickBackend(options.model);

    switch (backend) {
      case "opencode":
        return this.opencode.chat(options);
      case "openrouter":
        return this.callOpenAICompatible(
          "https://openrouter.ai/api/v1",
          process.env.OPENROUTER_API_KEY,
          options
        );
      case "openai":
        return this.callOpenAICompatible(
          "https://api.openai.com/v1",
          process.env.OPENAI_API_KEY,
          options
        );
      case "anthropic":
        return this.callAnthropic(options);
      case "local":
        return this.callOpenAICompatible(
          process.env.LOCAL_BASE_URL || "http://127.0.0.1:11434/v1",
          process.env.LOCAL_API_KEY || "ollama",
          options
        );
      default:
        return this.opencode.chat(options);
    }
  }

  private pickBackend(model?: string): BackendName {
    if (!model) return this.defaultBackend;
    if (model.startsWith("opencode/") || model.includes("free")) return "opencode";
    if (model.startsWith("openrouter/") || model.includes("/")) return "openrouter";
    if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) return "openai";
    if (model.startsWith("claude")) return "anthropic";
    return this.defaultBackend;
  }

  private async callOpenAICompatible(
    base: string,
    apiKey: string | undefined,
    options: ModelCallOptions
  ): Promise<ModelResponse> {
    if (!apiKey && !base.includes("127.0.0.1") && !base.includes("localhost")) {
      throw new Error(`Missing API key for ${base}`);
    }
    const url = `${base.replace(/\/$/, "")}/chat/completions`;
    const model = (options.model || "gpt-4o-mini").replace(/^openrouter\//, "");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`${base} ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = (await resp.json()) as any;
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content ?? "",
      model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
      raw: data,
    };
  }

  private async callAnthropic(options: ModelCallOptions): Promise<ModelResponse> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY required");

    const model = options.model || "claude-sonnet-4-20250514";
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 4096,
        messages: options.messages.filter((m) => m.role !== "system"),
        system: options.messages.find((m) => m.role === "system")?.content,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Anthropic ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = (await resp.json()) as any;
    const content = data.content?.[0]?.text ?? "";
    return {
      content,
      model,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
          }
        : undefined,
      raw: data,
    };
  }

  listFreeModels() {
    return this.opencode.listFreeModels();
  }
}

export const modelRouter = new ModelRouter();
