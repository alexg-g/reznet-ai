/**
 * Embedding Generation Module
 *
 * Generates vector embeddings for semantic memory storage and retrieval.
 *
 * Providers:
 *   - Ollama: nomic-embed-text (768 dims) — default, local
 *   - OpenAI: text-embedding-3-small (1536 dims) — cloud fallback
 *
 * Replaces the embedding portion of backend/agents/memory_manager.py.
 *
 * Same model and vector format as the Python implementation —
 * no re-embedding needed for existing vectors.
 */

import { settings } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmbeddingProvider = "ollama" | "openai";

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  model: string;
  provider: EmbeddingProvider;
}

// ---------------------------------------------------------------------------
// Ollama embeddings
// ---------------------------------------------------------------------------

/**
 * Generate embedding using Ollama's local embedding endpoint.
 *
 * Default model: nomic-embed-text (768 dimensions)
 * Endpoint: POST {OLLAMA_HOST}/api/embeddings
 */
async function generateOllamaEmbedding(text: string): Promise<EmbeddingResult> {
  const model = settings.OLLAMA_EMBEDDING_MODEL;
  const host = settings.OLLAMA_HOST;

  const response = await fetch(`${host}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Ollama embedding failed (${response.status}): ${body}. ` +
        `Is Ollama running at ${host}? ` +
        `Have you pulled ${model}? (ollama pull ${model})`,
    );
  }

  const data = (await response.json()) as { embedding?: number[] };

  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error(
      `Ollama response missing 'embedding' field: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  return {
    embedding: data.embedding,
    dimensions: data.embedding.length,
    model,
    provider: "ollama",
  };
}

// ---------------------------------------------------------------------------
// OpenAI embeddings
// ---------------------------------------------------------------------------

/**
 * Generate embedding using OpenAI's embedding API.
 *
 * Default model: text-embedding-3-small (1536 dimensions)
 * Endpoint: POST https://api.openai.com/v1/embeddings
 */
async function generateOpenAIEmbedding(text: string): Promise<EmbeddingResult> {
  const apiKey = settings.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY required for OpenAI embeddings");
  }

  const model = settings.EMBEDDING_MODEL;

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI embedding failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  const embedding = data.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error(
      `OpenAI response missing embedding: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  return {
    embedding,
    dimensions: embedding.length,
    model,
    provider: "openai",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an embedding vector for the given text.
 *
 * Routes to the configured embedding provider (default: ollama).
 * Falls back from Anthropic → Ollama → OpenAI since Anthropic
 * doesn't offer embeddings.
 *
 * @param text - Text to embed
 * @param provider - Override the default embedding provider
 * @returns Embedding vector as number[]
 */
export async function generateEmbedding(
  text: string,
  provider?: EmbeddingProvider,
): Promise<number[]> {
  const effectiveProvider =
    provider ?? (settings.DEFAULT_EMBEDDING_PROVIDER as EmbeddingProvider);

  if (effectiveProvider === "ollama") {
    const result = await generateOllamaEmbedding(text);
    return result.embedding;
  }

  if (effectiveProvider === "openai") {
    const result = await generateOpenAIEmbedding(text);
    return result.embedding;
  }

  // Default fallback: try Ollama first, then OpenAI
  try {
    const result = await generateOllamaEmbedding(text);
    return result.embedding;
  } catch (ollamaErr) {
    console.warn(
      `[embeddings] Ollama fallback failed: ${ollamaErr instanceof Error ? ollamaErr.message : ollamaErr}`,
    );

    if (settings.OPENAI_API_KEY) {
      const result = await generateOpenAIEmbedding(text);
      return result.embedding;
    }

    throw ollamaErr;
  }
}

/**
 * Generate embedding with full metadata.
 */
export async function generateEmbeddingWithMeta(
  text: string,
  provider?: EmbeddingProvider,
): Promise<EmbeddingResult> {
  const effectiveProvider =
    provider ?? (settings.DEFAULT_EMBEDDING_PROVIDER as EmbeddingProvider);

  if (effectiveProvider === "ollama") {
    return generateOllamaEmbedding(text);
  }

  if (effectiveProvider === "openai") {
    return generateOpenAIEmbedding(text);
  }

  // Fallback chain
  try {
    return await generateOllamaEmbedding(text);
  } catch {
    if (settings.OPENAI_API_KEY) {
      return generateOpenAIEmbedding(text);
    }
    throw new Error("No embedding provider available");
  }
}
