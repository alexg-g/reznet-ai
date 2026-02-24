/**
 * LLM Error Handling — retry, fallback, and error classification.
 *
 * Ports backend/core/error_handling.py (327 LOC) to TypeScript.
 * Wraps pi-ai calls with resilience patterns:
 *   - Typed error hierarchy with retryable classification
 *   - Exponential backoff retry
 *   - Multi-provider fallback chain
 *   - Structured error logging
 */

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export enum ErrorType {
  API_ERROR = "api_error",
  TIMEOUT = "timeout",
  QUOTA_EXCEEDED = "quota_exceeded",
  AUTHENTICATION = "authentication",
  RATE_LIMIT = "rate_limit",
  NETWORK = "network",
  VALIDATION = "validation",
  UNKNOWN = "unknown",
}

export class LLMError extends Error {
  readonly errorType: ErrorType;
  readonly retryable: boolean;
  provider?: string;
  model?: string;
  readonly originalError?: unknown;

  constructor(
    message: string,
    errorType: ErrorType,
    retryable: boolean,
    opts?: { provider?: string; model?: string; originalError?: unknown },
  ) {
    super(message);
    this.name = "LLMError";
    this.errorType = errorType;
    this.retryable = retryable;
    this.provider = opts?.provider;
    this.model = opts?.model;
    this.originalError = opts?.originalError;
  }

  toDict(): Record<string, unknown> {
    return {
      error_type: this.errorType,
      message: this.message,
      retryable: this.retryable,
      provider: this.provider,
      model: this.model,
    };
  }
}

export class LLMAPIError extends LLMError {
  constructor(message: string, opts?: { provider?: string; model?: string; originalError?: unknown }) {
    super(message, ErrorType.API_ERROR, true, opts);
    this.name = "LLMAPIError";
  }
}

export class LLMTimeoutError extends LLMError {
  constructor(message: string, opts?: { provider?: string; model?: string; originalError?: unknown }) {
    super(message, ErrorType.TIMEOUT, true, opts);
    this.name = "LLMTimeoutError";
  }
}

export class LLMQuotaError extends LLMError {
  constructor(message: string, opts?: { provider?: string; model?: string; originalError?: unknown }) {
    super(message, ErrorType.QUOTA_EXCEEDED, false, opts);
    this.name = "LLMQuotaError";
  }
}

export class LLMAuthenticationError extends LLMError {
  constructor(message: string, opts?: { provider?: string; model?: string; originalError?: unknown }) {
    super(message, ErrorType.AUTHENTICATION, false, opts);
    this.name = "LLMAuthenticationError";
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(message: string, opts?: { provider?: string; model?: string; originalError?: unknown }) {
    super(message, ErrorType.RATE_LIMIT, true, opts);
    this.name = "LLMRateLimitError";
  }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classify a raw error into a typed LLMError.
 * Uses string-based detection matching the Python implementation's keyword checks.
 */
export function classifyError(error: unknown, provider: string): LLMError {
  const errorStr = String(error).toLowerCase();
  const errorName = error instanceof Error ? error.constructor.name.toLowerCase() : "";

  const opts = { provider, originalError: error };

  // Timeout
  if (errorStr.includes("timeout") || errorStr.includes("timed out") || errorStr.includes("etimedout")) {
    return new LLMTimeoutError(`LLM request timed out (${provider})`, opts);
  }

  // Quota / billing
  if (
    errorStr.includes("quota") ||
    errorStr.includes("billing") ||
    errorStr.includes("insufficient_quota") ||
    errorStr.includes("overloaded")
  ) {
    return new LLMQuotaError(`LLM quota/billing issue (${provider}): ${errorStr.slice(0, 200)}`, opts);
  }

  // Authentication
  if (
    errorStr.includes("authentication") ||
    errorStr.includes("api_key") ||
    errorStr.includes("unauthorized") ||
    errorStr.includes("401") ||
    errorStr.includes("403") ||
    errorStr.includes("invalid_api_key")
  ) {
    return new LLMAuthenticationError(`LLM authentication failed (${provider})`, opts);
  }

  // Rate limit
  if (
    errorStr.includes("rate_limit") ||
    errorStr.includes("too_many_requests") ||
    errorStr.includes("429") ||
    errorStr.includes("rate limit")
  ) {
    return new LLMRateLimitError(`LLM rate limited (${provider})`, opts);
  }

  // Network / connection
  if (
    errorName.includes("connection") ||
    errorName.includes("http") ||
    errorName.includes("fetch") ||
    errorStr.includes("econnrefused") ||
    errorStr.includes("econnreset") ||
    errorStr.includes("enotfound") ||
    errorStr.includes("network")
  ) {
    return new LLMAPIError(`LLM network error (${provider}): ${errorStr.slice(0, 200)}`, opts);
  }

  // Default: generic API error (retryable)
  return new LLMAPIError(
    `LLM API error (${provider}): ${errorStr.slice(0, 200)}`,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

const log = {
  info: (msg: string) => console.info(`[llm] ${msg}`),
  warn: (msg: string) => console.warn(`[llm] WARN ${msg}`),
  error: (msg: string) => console.error(`[llm] ERROR ${msg}`),
};

export function structuredLogError(
  error: unknown,
  context: Record<string, unknown>,
): void {
  const logData: Record<string, unknown> = {
    error_type: error instanceof Error ? error.constructor.name : typeof error,
    error_message: String(error),
    ...context,
  };

  if (error instanceof LLMError) {
    logData.error_category = error.errorType;
    logData.retryable = error.retryable;
    logData.llm_provider = error.provider;
    logData.llm_model = error.model;
  }

  log.error(`Error occurred: ${JSON.stringify(logData)}`);
}

/**
 * Format user-friendly error message for agent responses.
 */
export function formatUserFriendlyError(error: unknown, agentName = "Agent"): string {
  if (error instanceof LLMError) {
    return `${agentName} encountered an issue: ${error.message}`;
  }
  return `${agentName} encountered an unexpected issue. Please try again or rephrase your request.`;
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  retryableErrors?: Array<new (...args: never[]) => LLMError>;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2.0,
  retryableErrors: [LLMAPIError, LLMTimeoutError, LLMRateLimitError],
};

/**
 * Execute an async function with exponential backoff retry.
 *
 * Mirrors Python's @retry_with_exponential_backoff decorator.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const { maxAttempts, initialDelayMs, backoffFactor, retryableErrors } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...opts,
  };

  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        retryableErrors.some((cls) => err instanceof cls) ||
        (err instanceof LLMError && err.retryable);

      if (!isRetryable || attempt >= maxAttempts) {
        log.error(
          `Failed after ${attempt} attempt(s): ${err instanceof Error ? err.constructor.name : "Unknown"}: ${String(err).slice(0, 200)}`,
        );
        throw err;
      }

      log.warn(
        `Attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms... ` +
          `Error: ${err instanceof Error ? err.constructor.name : "Unknown"}: ${String(err).slice(0, 200)}`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= backoffFactor;
    }
  }

  // Should not reach here, but TypeScript needs a return
  throw new LLMAPIError("Retry loop exhausted without success or throw");
}

// ---------------------------------------------------------------------------
// Fallback provider chain
// ---------------------------------------------------------------------------

/**
 * Static fallback chain — which providers to try when primary fails.
 * Mirrors Python's ErrorRecoveryStrategy.get_fallback_order().
 */
const FALLBACK_CHAINS: Record<string, string[]> = {
  anthropic: ["openai", "google", "groq", "ollama"],
  openai: ["anthropic", "google", "groq", "ollama"],
  google: ["anthropic", "openai", "groq", "ollama"],
  groq: ["anthropic", "openai", "google", "ollama"],
  ollama: ["anthropic", "openai", "google", "groq"],
};

/**
 * Get the ordered list of fallback providers for a given primary provider.
 */
export function getFallbackOrder(provider: string): string[] {
  return FALLBACK_CHAINS[provider] ?? Object.keys(FALLBACK_CHAINS).filter((p) => p !== provider);
}

/**
 * Determine whether we should try a different provider based on the error type.
 * Non-retryable errors (quota, auth) and persistent API errors warrant fallback.
 */
export function shouldFallbackToProvider(error: LLMError): boolean {
  return [ErrorType.QUOTA_EXCEEDED, ErrorType.AUTHENTICATION, ErrorType.API_ERROR].includes(
    error.errorType,
  );
}
