/**
 * LLM Client — thin wrapper around pi-ai.
 *
 * Replaces backend/agents/llm_client.py (710 LOC) with pi-ai's unified API.
 *
 * What pi-ai provides (we don't reimplement):
 *   - getModel() for 20+ providers (Anthropic, OpenAI, Google, Groq, Ollama, etc.)
 *   - complete() / stream() with automatic provider routing
 *   - Token counting and cost tracking
 *   - Response format normalization across providers
 *
 * What we add on top:
 *   - RezNet-specific defaults from config
 *   - Retry with exponential backoff (wrapping pi-ai calls)
 *   - Multi-provider fallback chain
 *   - Structured error classification and logging
 *   - Convenience methods matching our agent system's expectations
 */

import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Context,
  Model,
  ProviderStreamOptions,
  SimpleStreamOptions,
  Provider,
  Usage,
} from "@mariozechner/pi-ai";
import {
  getModel,
  getProviders,
  complete as piComplete,
  stream as piStream,
  completeSimple as piCompleteSimple,
  streamSimple as piStreamSimple,
  getEnvApiKey,
} from "@mariozechner/pi-ai";
import { settings } from "../config.js";
import {
  classifyError,
  ErrorType,
  LLMError,
  shouldFallbackToProvider,
  getFallbackOrder,
  withRetry,
  structuredLogError,
  type RetryOptions,
} from "./error-handling.js";

// ---------------------------------------------------------------------------
// Re-export pi-ai types for downstream consumers
// ---------------------------------------------------------------------------

export type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Context,
  Model,
  ProviderStreamOptions,
  SimpleStreamOptions,
  Usage,
  Provider,
};

// Re-export commonly used pi-ai functions
export { getModel, getProviders, getEnvApiKey };

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = {
  info: (msg: string) => console.info(`[llm] ${msg}`),
  warn: (msg: string) => console.warn(`[llm] WARN ${msg}`),
  error: (msg: string) => console.error(`[llm] ERROR ${msg}`),
};

// ---------------------------------------------------------------------------
// Provider → default model mapping (from settings)
// ---------------------------------------------------------------------------

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: settings.ANTHROPIC_DEFAULT_MODEL,
  openai: settings.OPENAI_DEFAULT_MODEL,
  google: settings.GOOGLE_DEFAULT_MODEL,
  groq: settings.GROQ_DEFAULT_MODEL,
  ollama: settings.OLLAMA_DEFAULT_MODEL,
};

/**
 * Get the default model ID for a provider from settings.
 */
export function getDefaultModel(provider: string): string {
  return DEFAULT_MODELS[provider] ?? "unknown";
}

// ---------------------------------------------------------------------------
// Available providers detection
// ---------------------------------------------------------------------------

/**
 * Check which providers have API keys configured.
 */
export function getAvailableProviders(): string[] {
  const available: string[] = [];

  if (settings.ANTHROPIC_API_KEY) available.push("anthropic");
  if (settings.OPENAI_API_KEY) available.push("openai");
  if (settings.GOOGLE_API_KEY) available.push("google");
  if (settings.GROQ_API_KEY) available.push("groq");
  if (settings.USE_OLLAMA) available.push("ollama");

  return available;
}

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a provider + optional model into a pi-ai Model instance.
 *
 * Uses settings defaults when model is not specified.
 * Handles Ollama's OpenAI-compatible API routing (pi-ai has no native
 * Ollama provider, so we construct a model object that uses Ollama's
 * OpenAI-compatible endpoint with the openai-responses API).
 */
export function resolveModel(
  provider?: string,
  modelId?: string,
): Model<Api> {
  const resolvedProvider = provider ?? settings.DEFAULT_LLM_PROVIDER;
  const resolvedModel = modelId ?? getDefaultModel(resolvedProvider);

  // Ollama: pi-ai supports any OpenAI-compatible API via the openai-completions
  // API type. We construct a custom Model object per the pi-ai docs.
  // Note: provider must be "openai" so pi-ai resolves OPENAI_API_KEY from env
  // (Ollama ignores the key). pi-agent-core's Agent class doesn't expose the
  // apiKey stream option, so we can't use provider: "ollama" directly.
  if (resolvedProvider === "ollama") {
    return {
      id: resolvedModel,
      name: resolvedModel,
      api: "openai-completions",
      provider: "openai",
      baseUrl: `${settings.OLLAMA_HOST}/v1`,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32000,
      maxTokens: 4000,
    } as Model<Api>;
  }

  // pi-ai uses getModel(provider, modelId) with typed overloads.
  // We cast because the provider/model combination is validated at runtime by pi-ai.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getModel(resolvedProvider as any, resolvedModel as any);
}

// ---------------------------------------------------------------------------
// LLM Client class
// ---------------------------------------------------------------------------

export interface LLMClientOptions {
  provider?: string;
  model?: string;
  retry?: RetryOptions;
}

export interface GenerateOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Context["tools"];
  signal?: AbortSignal;
}

/**
 * Normalized generation result matching the Python LLMClient return type.
 */
export interface GenerateResult {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> | null;
  usage: Usage;
  provider: string;
  model: string;
}

/**
 * LLM Client — wraps pi-ai with retry, fallback, and RezNet defaults.
 *
 * Usage:
 *   const client = new LLMClient();           // Uses DEFAULT_LLM_PROVIDER
 *   const client = new LLMClient({ provider: "groq", model: "llama-3.1-70b" });
 *
 *   const result = await client.generate("Hello world");
 *   for await (const event of client.stream("Hello world")) { ... }
 */
export class LLMClient {
  private provider: string;
  private modelId: string;
  private model: Model<Api>;
  private retryOpts: RetryOptions;

  constructor(opts?: LLMClientOptions) {
    this.provider = opts?.provider ?? settings.DEFAULT_LLM_PROVIDER;
    this.modelId = opts?.model ?? getDefaultModel(this.provider);
    this.retryOpts = opts?.retry ?? {};

    this.model = resolveModel(this.provider, this.modelId);

    log.info(`LLMClient initialized: ${this.provider}/${this.modelId}`);
  }

  /** Current provider name. */
  get currentProvider(): string {
    return this.provider;
  }

  /** Current model ID. */
  get currentModel(): string {
    return this.modelId;
  }

  /** The underlying pi-ai Model instance. */
  get piModel(): Model<Api> {
    return this.model;
  }

  // -------------------------------------------------------------------------
  // generate — non-streaming completion with retry + fallback
  // -------------------------------------------------------------------------

  /**
   * Generate a completion with retry and fallback.
   *
   * Mirrors Python LLMClient.generate() which returns (text, tool_calls).
   * Returns a normalized GenerateResult with usage metrics.
   */
  async generate(prompt: string, opts?: GenerateOptions): Promise<GenerateResult> {
    const context: Context = {
      systemPrompt: opts?.system,
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
      tools: opts?.tools,
    };

    const streamOpts: ProviderStreamOptions = {
      temperature: opts?.temperature ?? settings.DEFAULT_TEMPERATURE,
      maxTokens: opts?.maxTokens ?? settings.MAX_TOKENS_PER_RESPONSE,
      signal: opts?.signal,
    };

    try {
      return await withRetry(
        async () => {
          try {
            const msg = await piComplete(this.model, context, streamOpts);
            return this.normalizeResponse(msg);
          } catch (err) {
            const llmError = classifyError(err, this.provider);
            llmError.model = this.modelId;
            structuredLogError(err, {
              provider: this.provider,
              model: this.modelId,
              prompt_length: prompt.length,
              has_tools: opts?.tools != null,
            });
            throw llmError;
          }
        },
        this.retryOpts,
      );
    } catch (err) {
      // If primary provider fails with a fallback-worthy error, try fallbacks
      if (err instanceof LLMError && shouldFallbackToProvider(err)) {
        log.warn(`Primary provider ${this.provider} failed, attempting fallback...`);
        return this.tryFallbackProviders(context, streamOpts);
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // generateFromContext — takes a pre-built Context object
  // -------------------------------------------------------------------------

  /**
   * Generate from a full Context (for multi-turn conversations).
   */
  async generateFromContext(
    context: Context,
    opts?: Omit<GenerateOptions, "system" | "tools">,
  ): Promise<GenerateResult> {
    const streamOpts: ProviderStreamOptions = {
      temperature: opts?.temperature ?? settings.DEFAULT_TEMPERATURE,
      maxTokens: opts?.maxTokens ?? settings.MAX_TOKENS_PER_RESPONSE,
      signal: opts?.signal,
    };

    try {
      return await withRetry(
        async () => {
          try {
            const msg = await piComplete(this.model, context, streamOpts);
            return this.normalizeResponse(msg);
          } catch (err) {
            const llmError = classifyError(err, this.provider);
            llmError.model = this.modelId;
            throw llmError;
          }
        },
        this.retryOpts,
      );
    } catch (err) {
      if (err instanceof LLMError && shouldFallbackToProvider(err)) {
        log.warn(`Primary provider ${this.provider} failed, attempting fallback...`);
        return this.tryFallbackProviders(context, streamOpts);
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // stream — streaming completion (returns pi-ai event stream)
  // -------------------------------------------------------------------------

  /**
   * Stream a completion. Returns the raw pi-ai AssistantMessageEventStream.
   *
   * Note: Streaming does not support automatic retry/fallback because the
   * stream is consumed incrementally. Callers should handle errors from
   * stream events and retry at a higher level if needed.
   */
  stream(prompt: string, opts?: GenerateOptions): AssistantMessageEventStream {
    const context: Context = {
      systemPrompt: opts?.system,
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
      tools: opts?.tools,
    };

    const streamOpts: ProviderStreamOptions = {
      temperature: opts?.temperature ?? settings.DEFAULT_TEMPERATURE,
      maxTokens: opts?.maxTokens ?? settings.MAX_TOKENS_PER_RESPONSE,
      signal: opts?.signal,
    };

    return piStream(this.model, context, streamOpts);
  }

  /**
   * Stream from a full Context (for multi-turn conversations).
   */
  streamFromContext(
    context: Context,
    opts?: Omit<GenerateOptions, "system" | "tools">,
  ): AssistantMessageEventStream {
    const streamOpts: ProviderStreamOptions = {
      temperature: opts?.temperature ?? settings.DEFAULT_TEMPERATURE,
      maxTokens: opts?.maxTokens ?? settings.MAX_TOKENS_PER_RESPONSE,
      signal: opts?.signal,
    };

    return piStream(this.model, context, streamOpts);
  }

  // -------------------------------------------------------------------------
  // streamSimple — simplified streaming with reasoning support
  // -------------------------------------------------------------------------

  /**
   * Simplified streaming with optional reasoning/thinking support.
   */
  streamSimple(
    prompt: string,
    opts?: GenerateOptions & { reasoning?: SimpleStreamOptions["reasoning"] },
  ): AssistantMessageEventStream {
    const context: Context = {
      systemPrompt: opts?.system,
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
      tools: opts?.tools,
    };

    const streamOpts: SimpleStreamOptions = {
      temperature: opts?.temperature ?? settings.DEFAULT_TEMPERATURE,
      maxTokens: opts?.maxTokens ?? settings.MAX_TOKENS_PER_RESPONSE,
      signal: opts?.signal,
      reasoning: opts?.reasoning,
    };

    return piStreamSimple(this.model, context, streamOpts);
  }

  // -------------------------------------------------------------------------
  // completeSimple — non-streaming with reasoning support
  // -------------------------------------------------------------------------

  /**
   * Non-streaming completion with reasoning support.
   */
  async completeSimple(
    prompt: string,
    opts?: GenerateOptions & { reasoning?: SimpleStreamOptions["reasoning"] },
  ): Promise<GenerateResult> {
    const context: Context = {
      systemPrompt: opts?.system,
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
      tools: opts?.tools,
    };

    const streamOpts: SimpleStreamOptions = {
      temperature: opts?.temperature ?? settings.DEFAULT_TEMPERATURE,
      maxTokens: opts?.maxTokens ?? settings.MAX_TOKENS_PER_RESPONSE,
      signal: opts?.signal,
      reasoning: opts?.reasoning,
    };

    const msg = await piCompleteSimple(this.model, context, streamOpts);
    return this.normalizeResponse(msg);
  }

  // -------------------------------------------------------------------------
  // Fallback provider chain
  // -------------------------------------------------------------------------

  private async tryFallbackProviders(
    context: Context,
    streamOpts: ProviderStreamOptions,
  ): Promise<GenerateResult> {
    const fallbackProviders = getFallbackOrder(this.provider);
    const availableProviders = getAvailableProviders();

    // Only try providers that have API keys configured
    const viableFallbacks = fallbackProviders.filter((p) =>
      availableProviders.includes(p),
    );

    for (const fallbackProvider of viableFallbacks) {
      try {
        const fallbackModel = getDefaultModel(fallbackProvider);
        log.info(`Trying fallback provider: ${fallbackProvider}/${fallbackModel}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = getModel(fallbackProvider as any, fallbackModel as any);
        const msg = await piComplete(model, context, streamOpts);
        const result = this.normalizeResponse(msg);

        log.info(`Successfully used fallback provider: ${fallbackProvider}`);
        return result;
      } catch (err) {
        log.warn(`Fallback provider ${fallbackProvider} also failed: ${String(err).slice(0, 200)}`);
        continue;
      }
    }

    // All fallbacks exhausted
    throw new LLMError(
      `All LLM providers failed. Original: ${this.provider}, Tried: ${viableFallbacks.join(", ")}`,
      ErrorType.API_ERROR,
      false,
      { provider: this.provider, model: this.modelId },
    );
  }

  // -------------------------------------------------------------------------
  // Response normalization
  // -------------------------------------------------------------------------

  /**
   * Normalize pi-ai's AssistantMessage into our GenerateResult format.
   * This matches the Python LLMClient's (text, tool_calls) return convention.
   */
  private normalizeResponse(msg: AssistantMessage): GenerateResult {
    let text = "";
    const toolCalls: GenerateResult["toolCalls"] = [];

    for (const block of msg.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "toolCall") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.arguments,
        });
      }
      // "thinking" blocks are intentionally not included in the text output
    }

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      usage: msg.usage,
      provider: msg.provider,
      model: msg.model,
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience function — create a client with defaults
// ---------------------------------------------------------------------------

/**
 * Create an LLMClient with settings defaults. Convenience export.
 */
export function createLLMClient(opts?: LLMClientOptions): LLMClient {
  return new LLMClient(opts);
}
