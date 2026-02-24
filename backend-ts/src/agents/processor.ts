/**
 * Message Processing Pipeline — @mention routing, agent invocation,
 * streaming relay, and recursive delegation.
 *
 * Replaces backend/agents/processor.py (686 LOC).
 *
 * Pipeline flow:
 *   1. User sends message (via WebSocket)
 *   2. Extract @mentions from message content
 *   3. For each mentioned agent:
 *      a. Look up agent record in database
 *      b. Check availability (is_active, !is_busy)
 *      c. Mark agent busy + broadcast 'agent_status' thinking
 *      d. Build context from recent messages
 *      e. Process message (streaming or non-streaming)
 *      f. Save agent response to database
 *      g. Broadcast 'message_new' / 'message_stream' / 'message_update'
 *      h. Check agent response for @mentions (recursive delegation)
 *      i. Mark agent available + broadcast 'agent_status' online
 */

import { randomUUID } from "crypto";
import { eq, desc, and, gt } from "drizzle-orm";
import { db } from "../db/connection.js";
import { agents, messages, channels } from "../db/schema.js";
import { parseMentions, type AgentName } from "./tools/delegation.js";
import {
  RezNetAgent,
  type ProcessMessageContext,
  type AgentPersona,
} from "./base-agent.js";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { wsManager } from "../websocket/manager.js";
import { resolveModel } from "../llm/client.js";
import { createSpecialistAgent } from "./specialists.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum recursion depth for agent-to-agent delegation. */
const MAX_DELEGATION_DEPTH = 3;

// ---------------------------------------------------------------------------
// Agent cache
// ---------------------------------------------------------------------------

const agentCache = new Map<string, RezNetAgent>();

/**
 * Get or create an agent instance (cached for reuse).
 */
function getOrCreateAgent(
  agentId: string,
  agentType: string,
  _persona: unknown,
): RezNetAgent {
  if (agentCache.has(agentId)) {
    return agentCache.get(agentId)!;
  }

  // Determine if this is a known specialist type
  const knownType = agentType as AgentName;
  const isKnown = ["orchestrator", "backend", "frontend", "qa", "devops"].includes(knownType);

  let agent: RezNetAgent;

  if (isKnown) {
    agent = createSpecialistAgent({
      agentId,
      agentType: knownType,
      model: resolveModel(),
      onDelegate: async (target, task) => {
        // Recursive delegation via agent cache
        const targetAgent = agentCache.get(`agent-${target}`);
        if (targetAgent) {
          return targetAgent.processMessage(task);
        }
        return `Agent @${target} is not available.`;
      },
    });
  } else {
    // Custom agent — use persona from database
    const persona = (_persona as AgentPersona) ?? {
      role: `a ${agentType} specialist`,
      goal: "Help with tasks related to your expertise.",
      backstory: "You are a specialist agent.",
      capabilities: ["General assistance"],
      color: "#888888",
    };

    agent = new RezNetAgent({
      agentId,
      name: agentType,
      agentType,
      persona,
      model: resolveModel(),
    });
  }

  agentCache.set(agentId, agent);
  return agent;
}

/**
 * Clear the agent cache (e.g., on shutdown).
 */
export function clearAgentCache(): void {
  agentCache.clear();
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Build conversation context from recent messages in a channel.
 */
async function buildMessageContext(
  channelId: string,
  _depth: number,
  _callChain: string[],
): Promise<ProcessMessageContext> {
  // Get channel to check context_cleared_at
  const channelRows = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  const channel = channelRows[0];

  // Build base query conditions
  const conditions = [eq(messages.channelId, channelId)];

  // Only include messages after context was cleared
  if (channel?.contextClearedAt) {
    conditions.push(gt(messages.createdAt, channel.contextClearedAt));
  }

  // Get recent 10 messages
  const recentMessages = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(10);

  // Reverse to chronological order
  const conversationHistory = recentMessages.reverse().map((msg) => ({
    role: msg.authorType,
    content: msg.content,
    author: msg.authorName ?? undefined,
  }));

  return {
    conversationHistory,
    channelId,
  };
}

// ---------------------------------------------------------------------------
// Message serializer
// ---------------------------------------------------------------------------

/**
 * Serialize a message record for WebSocket broadcast.
 */
function serializeMessage(msg: {
  id: string;
  channelId: string;
  authorType: string;
  authorName: string | null;
  authorId: string | null;
  content: string;
  createdAt: Date | null;
  threadId: string | null;
  msgMetadata: unknown;
}): Record<string, unknown> {
  return {
    id: msg.id,
    channel_id: msg.channelId,
    author_type: msg.authorType,
    author_name: msg.authorName,
    author_id: msg.authorId,
    content: msg.content,
    created_at: msg.createdAt?.toISOString() ?? new Date().toISOString(),
    thread_id: msg.threadId,
    metadata: msg.msgMetadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// Core: processAgentMessage
// ---------------------------------------------------------------------------

export interface ProcessAgentMessageOptions {
  messageId: string;
  content: string;
  channelId: string;
  mentionedAgents: AgentName[];
  depth?: number;
  callChain?: string[];
}

/**
 * Process a message that mentions one or more agents.
 *
 * For each mentioned agent:
 *   1. Look up in database
 *   2. Check availability
 *   3. Process message with streaming
 *   4. Save response
 *   5. Check for recursive delegation
 */
export async function processAgentMessage(
  opts: ProcessAgentMessageOptions,
): Promise<void> {
  const {
    messageId,
    content,
    channelId,
    mentionedAgents,
    depth = 0,
    callChain = [],
  } = opts;

  // Depth guard
  if (depth >= MAX_DELEGATION_DEPTH) {
    console.warn(
      `[processor] Max recursion depth (${MAX_DELEGATION_DEPTH}) reached, stopping agent chain`,
    );
    return;
  }

  // Process each mentioned agent
  for (const agentName of mentionedAgents) {
    try {
      await processOneAgent({
        agentName,
        messageId,
        content,
        channelId,
        depth,
        callChain,
      });
    } catch (err) {
      console.error(
        `[processor] Error processing @${agentName}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Process a single agent
// ---------------------------------------------------------------------------

interface ProcessOneAgentOptions {
  agentName: AgentName;
  messageId: string;
  content: string;
  channelId: string;
  depth: number;
  callChain: string[];
}

async function processOneAgent(opts: ProcessOneAgentOptions): Promise<void> {
  const { agentName, messageId, content, channelId, depth, callChain } = opts;

  // 1. Look up agent in database
  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.name, agentName))
    .limit(1);

  const agentRecord = agentRows[0];
  if (!agentRecord) {
    console.warn(`[processor] Agent @${agentName} not found in database`);
    return;
  }

  // 2. Check availability
  if (!agentRecord.isActive) {
    console.warn(`[processor] Agent @${agentName} is inactive`);
    return;
  }

  if (agentRecord.isBusy) {
    // Send busy message
    const busyMsg = await db
      .insert(messages)
      .values({
        id: randomUUID(),
        channelId,
        authorType: "system",
        authorName: "System",
        content: `@${agentName} is currently busy. Please try again in a moment.`,
        msgMetadata: { busy: true, agent: agentName },
      })
      .returning();

    if (busyMsg[0]) {
      wsManager.broadcast("message_new", serializeMessage(busyMsg[0]));
    }
    return;
  }

  // 3. Mark agent as busy
  await db
    .update(agents)
    .set({ isBusy: true, currentTaskId: messageId })
    .where(eq(agents.id, agentRecord.id));

  // Broadcast thinking status
  wsManager.broadcast(
    "agent_status",
    { agent_name: `@${agentName}`, status: "thinking" },
    { batch: true },
  );

  try {
    // 4. Build context
    const context = await buildMessageContext(channelId, depth, callChain);

    // 5. Get or create agent instance
    const agent = getOrCreateAgent(
      agentRecord.id,
      agentRecord.name,
      agentRecord.persona,
    );

    // 6. Create placeholder message for streaming
    const placeholderMsg = await db
      .insert(messages)
      .values({
        id: randomUUID(),
        channelId,
        authorId: agentRecord.id,
        authorType: "agent",
        authorName: `@${agentRecord.name}`,
        content: "",
        msgMetadata: {
          in_reply_to: messageId,
          streaming: true,
        },
      })
      .returning();

    const placeholder = placeholderMsg[0];
    if (!placeholder) {
      throw new Error("Failed to create placeholder message");
    }

    // Broadcast empty placeholder
    wsManager.broadcast("message_new", serializeMessage(placeholder));

    // 7. Process with streaming
    let accumulatedResponse = "";

    const response = await agent.processMessageStreaming(
      content,
      context,
      (event: AgentEvent) => {
        if (event.type === "message_update") {
          // Extract text chunks from streaming
          const msg = event.message;
          if (msg && "content" in msg && Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (typeof block === "object" && "type" in block && block.type === "text" && "text" in block) {
                const text = block.text as string;
                if (text.length > accumulatedResponse.length) {
                  const chunk = text.slice(accumulatedResponse.length);
                  accumulatedResponse = text;

                  // Relay streaming chunk
                  wsManager.broadcast("message_stream", {
                    message_id: placeholder.id,
                    chunk,
                    is_final: false,
                  });
                }
              }
            }
          }
        }
      },
    );

    // Use final response
    accumulatedResponse = response;

    // 8. Update placeholder with complete content
    await db
      .update(messages)
      .set({
        content: accumulatedResponse,
        msgMetadata: {
          in_reply_to: messageId,
          streaming: false,
        },
      })
      .where(eq(messages.id, placeholder.id));

    // Broadcast final message update
    wsManager.broadcast("message_update", {
      id: placeholder.id,
      channel_id: channelId,
      author_type: "agent",
      author_name: `@${agentRecord.name}`,
      author_id: agentRecord.id,
      content: accumulatedResponse,
      created_at: placeholder.createdAt?.toISOString(),
      metadata: {
        in_reply_to: messageId,
        streaming: false,
      },
    });

    // Send final stream marker
    wsManager.broadcast("message_stream", {
      message_id: placeholder.id,
      chunk: "",
      is_final: true,
    });

    // 9. Check for recursive delegation
    if (depth < MAX_DELEGATION_DEPTH - 1) {
      const responseMentions = parseMentions(accumulatedResponse);
      const newAgents = responseMentions.filter(
        (name) => !callChain.includes(name) && name !== agentName,
      );

      if (newAgents.length > 0) {
        // Fire and forget — non-blocking recursive delegation
        void processAgentMessage({
          messageId: placeholder.id,
          content: accumulatedResponse,
          channelId,
          mentionedAgents: newAgents,
          depth: depth + 1,
          callChain: [...callChain, agentName],
        });
      }
    }
  } catch (err) {
    console.error(
      `[processor] Error in agent @${agentName}:`,
      err instanceof Error ? err.message : err,
    );

    // Save error message
    const errorContent =
      err instanceof Error
        ? `I encountered an error: ${err.message}`
        : "I encountered an unexpected error. Please try again.";

    const errorMsg = await db
      .insert(messages)
      .values({
        id: randomUUID(),
        channelId,
        authorId: agentRecord.id,
        authorType: "agent",
        authorName: `@${agentRecord.name}`,
        content: errorContent,
        msgMetadata: {
          error: true,
          in_reply_to: messageId,
        },
      })
      .returning();

    if (errorMsg[0]) {
      wsManager.broadcast("message_new", serializeMessage(errorMsg[0]));
    }
  } finally {
    // 10. Mark agent available
    await db
      .update(agents)
      .set({ isBusy: false, currentTaskId: null })
      .where(eq(agents.id, agentRecord.id));

    wsManager.broadcast(
      "agent_status",
      { agent_name: `@${agentName}`, status: "online" },
      { batch: true },
    );
  }
}

// ---------------------------------------------------------------------------
// Direct agent invocation (bypasses @mention parsing)
// ---------------------------------------------------------------------------

export interface InvokeAgentOptions {
  agentName: string;
  message: string;
  channelId?: string;
  context?: Record<string, unknown>;
}

/**
 * Directly invoke a specific agent by name.
 * Used by the agent_invoke WebSocket event.
 */
export async function invokeAgent(
  opts: InvokeAgentOptions,
): Promise<{ agentName: string; response: string }> {
  const name = opts.agentName.startsWith("@")
    ? opts.agentName.slice(1)
    : opts.agentName;

  // If channel provided, route through full pipeline
  if (opts.channelId) {
    await processAgentMessage({
      messageId: randomUUID(),
      content: opts.message,
      channelId: opts.channelId,
      mentionedAgents: [name as AgentName],
    });
    return { agentName: name, response: "(processing via WebSocket)" };
  }

  // Direct invocation without channel — simpler path
  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.name, name))
    .limit(1);

  const agentRecord = agentRows[0];
  if (!agentRecord || !agentRecord.isActive) {
    throw new Error(`Agent @${name} not found or inactive`);
  }

  const agent = getOrCreateAgent(
    agentRecord.id,
    agentRecord.name,
    agentRecord.persona,
  );

  const response = await agent.processMessage(opts.message);
  return { agentName: name, response };
}
