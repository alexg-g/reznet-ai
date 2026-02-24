/**
 * Phase 2 Validation Tests — LLM Layer (pi-ai integration)
 *
 * Validates all Phase 2 acceptance criteria:
 *   1. pi-ai model instantiation works for multiple providers
 *   2. Error classification correctly categorizes errors
 *   3. Retry with exponential backoff works
 *   4. Fallback chain logic is correct
 *   5. LLMClient wraps pi-ai with RezNet defaults
 *   6. Streaming API is accessible
 *   7. (Optional) Live API call if credentials are available
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Test 1: pi-ai Model Instantiation
// ---------------------------------------------------------------------------

describe("pi-ai Model Instantiation", () => {
  it("instantiates Anthropic models", async () => {
    const { getModel } = await import("@mariozechner/pi-ai");
    const model = getModel("anthropic", "claude-sonnet-4-20250514");

    expect(model).toBeDefined();
    expect(model.provider).toBe("anthropic");
    expect(model.id).toBe("claude-sonnet-4-20250514");
    expect(model.api).toBe("anthropic-messages");
    expect(model.contextWindow).toBeGreaterThan(0);
    expect(model.maxTokens).toBeGreaterThan(0);
    expect(model.cost).toBeDefined();
    expect(model.cost.input).toBeGreaterThan(0);
  });

  it("instantiates OpenAI models", async () => {
    const { getModel } = await import("@mariozechner/pi-ai");
    const model = getModel("openai", "gpt-4o");

    expect(model).toBeDefined();
    expect(model.provider).toBe("openai");
    expect(model.id).toBe("gpt-4o");
  });

  it("instantiates Google models", async () => {
    const { getModel } = await import("@mariozechner/pi-ai");
    const model = getModel("google", "gemini-2.0-flash");

    expect(model).toBeDefined();
    expect(model.provider).toBe("google");
    expect(model.id).toBe("gemini-2.0-flash");
  });

  it("instantiates Groq models", async () => {
    const { getModel } = await import("@mariozechner/pi-ai");
    const model = getModel("groq", "llama-3.3-70b-versatile");

    expect(model).toBeDefined();
    expect(model.provider).toBe("groq");
    expect(model.id).toBe("llama-3.3-70b-versatile");
  });

  it("lists available providers", async () => {
    const { getProviders } = await import("@mariozechner/pi-ai");
    const providers = getProviders();

    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toContain("google");
    expect(providers).toContain("groq");
    expect(providers.length).toBeGreaterThan(10); // 20+ providers
  });

  it("model has cost information for token tracking", async () => {
    const { getModel } = await import("@mariozechner/pi-ai");
    const model = getModel("anthropic", "claude-sonnet-4-20250514");

    expect(model.cost).toEqual(
      expect.objectContaining({
        input: expect.any(Number),
        output: expect.any(Number),
        cacheRead: expect.any(Number),
        cacheWrite: expect.any(Number),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: Error Classification
// ---------------------------------------------------------------------------

describe("Error Classification", () => {
  it("classifies timeout errors", async () => {
    const { classifyError, LLMTimeoutError } = await import(
      "../llm/error-handling.js"
    );

    const err = classifyError(new Error("Request timed out"), "anthropic");
    expect(err).toBeInstanceOf(LLMTimeoutError);
    expect(err.retryable).toBe(true);
    expect(err.provider).toBe("anthropic");
  });

  it("classifies quota/billing errors", async () => {
    const { classifyError, LLMQuotaError } = await import(
      "../llm/error-handling.js"
    );

    const err = classifyError(
      new Error("insufficient_quota: you have exceeded your billing limit"),
      "openai",
    );
    expect(err).toBeInstanceOf(LLMQuotaError);
    expect(err.retryable).toBe(false);
  });

  it("classifies authentication errors", async () => {
    const { classifyError, LLMAuthenticationError } = await import(
      "../llm/error-handling.js"
    );

    const err = classifyError(
      new Error("401 Unauthorized: invalid api_key"),
      "anthropic",
    );
    expect(err).toBeInstanceOf(LLMAuthenticationError);
    expect(err.retryable).toBe(false);
  });

  it("classifies rate limit errors", async () => {
    const { classifyError, LLMRateLimitError } = await import(
      "../llm/error-handling.js"
    );

    const err = classifyError(
      new Error("429 Too Many Requests: rate_limit exceeded"),
      "openai",
    );
    expect(err).toBeInstanceOf(LLMRateLimitError);
    expect(err.retryable).toBe(true);
  });

  it("classifies network errors", async () => {
    const { classifyError, LLMAPIError } = await import(
      "../llm/error-handling.js"
    );

    const err = classifyError(
      new Error("ECONNREFUSED: connection refused"),
      "ollama",
    );
    expect(err).toBeInstanceOf(LLMAPIError);
    expect(err.retryable).toBe(true);
  });

  it("classifies overloaded as quota error", async () => {
    const { classifyError, LLMQuotaError } = await import(
      "../llm/error-handling.js"
    );

    const err = classifyError(
      new Error("Anthropic API is currently overloaded"),
      "anthropic",
    );
    expect(err).toBeInstanceOf(LLMQuotaError);
    expect(err.retryable).toBe(false);
  });

  it("classifies unknown errors as retryable API errors", async () => {
    const { classifyError, LLMAPIError } = await import(
      "../llm/error-handling.js"
    );

    const err = classifyError(
      new Error("Something went completely wrong"),
      "google",
    );
    expect(err).toBeInstanceOf(LLMAPIError);
    expect(err.retryable).toBe(true);
  });

  it("preserves original error", async () => {
    const { classifyError } = await import("../llm/error-handling.js");

    const original = new TypeError("fetch failed");
    const err = classifyError(original, "anthropic");
    expect(err.originalError).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Test 3: LLMError serialization
// ---------------------------------------------------------------------------

describe("LLMError", () => {
  it("serializes to dictionary", async () => {
    const { LLMAPIError, ErrorType } = await import(
      "../llm/error-handling.js"
    );

    const err = new LLMAPIError("test error", {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });

    const dict = err.toDict();
    expect(dict).toEqual({
      error_type: ErrorType.API_ERROR,
      message: "test error",
      retryable: true,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });
  });

  it("formats user-friendly messages", async () => {
    const { LLMAPIError, formatUserFriendlyError } = await import(
      "../llm/error-handling.js"
    );

    const err = new LLMAPIError("API call failed");
    const msg = formatUserFriendlyError(err, "@backend");
    expect(msg).toContain("@backend");
    expect(msg).toContain("API call failed");
  });

  it("formats generic error message for non-LLM errors", async () => {
    const { formatUserFriendlyError } = await import(
      "../llm/error-handling.js"
    );

    const msg = formatUserFriendlyError(new Error("random"), "@qa");
    expect(msg).toContain("@qa");
    expect(msg).toContain("unexpected");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Retry with Exponential Backoff
// ---------------------------------------------------------------------------

describe("Retry with Exponential Backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds on first attempt without retry", async () => {
    const { withRetry } = await import("../llm/error-handling.js");

    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn, { maxAttempts: 3 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors and succeeds", async () => {
    const { withRetry, LLMAPIError } = await import(
      "../llm/error-handling.js"
    );

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new LLMAPIError("fail 1"))
      .mockRejectedValueOnce(new LLMAPIError("fail 2"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
      backoffFactor: 2,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after max attempts exhausted", async () => {
    const { withRetry, LLMAPIError } = await import(
      "../llm/error-handling.js"
    );

    const fn = vi.fn().mockRejectedValue(new LLMAPIError("persistent failure"));

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 }),
    ).rejects.toThrow("persistent failure");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable errors", async () => {
    const { withRetry, LLMQuotaError } = await import(
      "../llm/error-handling.js"
    );

    const fn = vi
      .fn()
      .mockRejectedValue(new LLMQuotaError("quota exceeded"));

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 }),
    ).rejects.toThrow("quota exceeded");

    expect(fn).toHaveBeenCalledTimes(1); // No retry
  });

  it("does not retry authentication errors", async () => {
    const { withRetry, LLMAuthenticationError } = await import(
      "../llm/error-handling.js"
    );

    const fn = vi
      .fn()
      .mockRejectedValue(new LLMAuthenticationError("invalid api key"));

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 }),
    ).rejects.toThrow("invalid api key");

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Fallback Provider Chain
// ---------------------------------------------------------------------------

describe("Fallback Provider Chain", () => {
  it("returns correct fallback order for anthropic", async () => {
    const { getFallbackOrder } = await import("../llm/error-handling.js");

    const order = getFallbackOrder("anthropic");
    expect(order).toContain("openai");
    expect(order).toContain("google");
    expect(order).toContain("groq");
    expect(order).not.toContain("anthropic");
  });

  it("returns correct fallback order for openai", async () => {
    const { getFallbackOrder } = await import("../llm/error-handling.js");

    const order = getFallbackOrder("openai");
    expect(order).toContain("anthropic");
    expect(order).not.toContain("openai");
  });

  it("returns all others for unknown provider", async () => {
    const { getFallbackOrder } = await import("../llm/error-handling.js");

    const order = getFallbackOrder("custom-provider");
    expect(order.length).toBeGreaterThan(0);
    expect(order).not.toContain("custom-provider");
  });

  it("determines when to fallback to different provider", async () => {
    const {
      shouldFallbackToProvider,
      LLMQuotaError,
      LLMAuthenticationError,
      LLMAPIError,
      LLMRateLimitError,
      LLMTimeoutError,
    } = await import("../llm/error-handling.js");

    // Should fallback: quota, auth, api errors
    expect(shouldFallbackToProvider(new LLMQuotaError("quota"))).toBe(true);
    expect(
      shouldFallbackToProvider(new LLMAuthenticationError("auth")),
    ).toBe(true);
    expect(shouldFallbackToProvider(new LLMAPIError("api"))).toBe(true);

    // Should NOT fallback: rate limit (retryable), timeout (transient)
    expect(
      shouldFallbackToProvider(new LLMRateLimitError("rate limit")),
    ).toBe(false);
    expect(
      shouldFallbackToProvider(new LLMTimeoutError("timeout")),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 6: LLMClient initialization and model resolution
// ---------------------------------------------------------------------------

describe("LLMClient", () => {
  it("initializes with default provider from settings", async () => {
    const { LLMClient } = await import("../llm/client.js");

    const client = new LLMClient();
    expect(client.currentProvider).toBeTruthy();
    expect(client.currentModel).toBeTruthy();
    expect(client.piModel).toBeDefined();
    // Ollama routes through OpenAI's API, so piModel.provider may differ
    if (client.currentProvider !== "ollama") {
      expect(client.piModel.provider).toBe(client.currentProvider);
    }
  });

  it("initializes with explicit provider and model", async () => {
    const { LLMClient } = await import("../llm/client.js");

    const client = new LLMClient({
      provider: "openai",
      model: "gpt-4o",
    });
    expect(client.currentProvider).toBe("openai");
    expect(client.currentModel).toBe("gpt-4o");
    expect(client.piModel.id).toBe("gpt-4o");
  });

  it("resolveModel returns correct pi-ai model", async () => {
    const { resolveModel } = await import("../llm/client.js");

    const model = resolveModel("anthropic", "claude-sonnet-4-20250514");
    expect(model.provider).toBe("anthropic");
    expect(model.id).toBe("claude-sonnet-4-20250514");
  });

  it("resolveModel uses settings defaults when no model specified", async () => {
    const { resolveModel } = await import("../llm/client.js");

    const model = resolveModel("anthropic");
    expect(model.provider).toBe("anthropic");
    expect(model.id).toBeTruthy();
  });

  it("getAvailableProviders detects configured providers", async () => {
    const { getAvailableProviders } = await import("../llm/client.js");

    const providers = getAvailableProviders();
    // With test API keys set, providers should be detected
    expect(Array.isArray(providers)).toBe(true);
  });

  it("provides stream method", async () => {
    const { LLMClient } = await import("../llm/client.js");

    const client = new LLMClient({ provider: "anthropic" });
    expect(typeof client.stream).toBe("function");
    expect(typeof client.streamFromContext).toBe("function");
    expect(typeof client.streamSimple).toBe("function");
  });

  it("provides generate method", async () => {
    const { LLMClient } = await import("../llm/client.js");

    const client = new LLMClient({ provider: "anthropic" });
    expect(typeof client.generate).toBe("function");
    expect(typeof client.generateFromContext).toBe("function");
    expect(typeof client.completeSimple).toBe("function");
  });

  it("createLLMClient factory function works", async () => {
    const { createLLMClient } = await import("../llm/client.js");

    const client = createLLMClient({ provider: "google", model: "gemini-2.0-flash" });
    expect(client.currentProvider).toBe("google");
    expect(client.currentModel).toBe("gemini-2.0-flash");
  });
});

// ---------------------------------------------------------------------------
// Test 7: Streaming API structure (no live calls)
// ---------------------------------------------------------------------------

describe("Streaming API Structure", () => {
  it("stream returns an AssistantMessageEventStream (async iterable)", async () => {
    const { LLMClient } = await import("../llm/client.js");

    const client = new LLMClient({ provider: "anthropic" });
    const s = client.stream("Hello", {
      system: "You are a test.",
      signal: AbortSignal.abort(), // Immediately abort to avoid actual API call
    });

    // AssistantMessageEventStream should be an async iterable
    expect(s).toBeDefined();
    expect(typeof s[Symbol.asyncIterator]).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Test 8: Live API call (only if ANTHROPIC_API_KEY is a real key)
// ---------------------------------------------------------------------------

describe("Live API Call", () => {
  const hasRealKey =
    process.env.ANTHROPIC_API_KEY &&
    process.env.ANTHROPIC_API_KEY !== "test-key" &&
    !process.env.ANTHROPIC_API_KEY.startsWith("your-");

  it.skipIf(!hasRealKey)(
    "generates a response from Anthropic (live)",
    async () => {
      const { LLMClient } = await import("../llm/client.js");

      const client = new LLMClient({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001", // cheapest model for testing
      });

      const result = await client.generate("Say exactly: hello world", {
        system: "You are a test bot. Only reply with the exact text requested.",
        maxTokens: 50,
        temperature: 0,
      });

      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toContain("hello");
      expect(result.usage.input).toBeGreaterThan(0);
      expect(result.usage.output).toBeGreaterThan(0);
      expect(result.usage.cost.total).toBeGreaterThan(0);
      expect(result.provider).toBe("anthropic");
    },
    30_000,
  );

  it.skipIf(!hasRealKey)(
    "streams a response from Anthropic (live)",
    async () => {
      const { LLMClient } = await import("../llm/client.js");

      const client = new LLMClient({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
      });

      const s = client.stream("Say exactly: streaming works", {
        system: "You are a test bot.",
        maxTokens: 50,
        temperature: 0,
      });

      let receivedText = false;
      let receivedDone = false;
      const textChunks: string[] = [];

      for await (const event of s) {
        if (event.type === "text_delta") {
          receivedText = true;
          textChunks.push(event.delta);
        }
        if (event.type === "done") {
          receivedDone = true;
        }
      }

      expect(receivedText).toBe(true);
      expect(receivedDone).toBe(true);
      expect(textChunks.join("").toLowerCase()).toContain("streaming");
    },
    30_000,
  );
});
