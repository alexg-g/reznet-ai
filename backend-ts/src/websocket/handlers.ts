/**
 * Socket.IO Event Handlers — wires WebSocket events to the message
 * processing pipeline.
 *
 * Events handled:
 *   Client → Server:
 *     - message_send: User sends a message (with optional @mentions)
 *     - agent_invoke: Directly invoke a specific agent
 *     - typing_start: User typing indicator
 *     - ping: Connection keepalive
 *     - get_stats: Request WebSocket performance stats
 *
 *   Server → Client (via processor/manager):
 *     - connection_established: Welcome on connect
 *     - message_new: New message (user or agent)
 *     - message_stream: LLM streaming chunk
 *     - message_update: Final message after streaming
 *     - agent_status: Agent state change (thinking/online)
 *     - user_typing: Typing indicator
 *     - error: Error notification
 *     - message_batch: Batched messages
 *     - stats_response: Performance statistics
 *     - context_cleared: Channel context cleared
 */

import type { Server as SocketIOServer, Socket } from "socket.io";
import { randomUUID } from "crypto";
import { db } from "../db/connection.js";
import { messages } from "../db/schema.js";
import { parseMentions } from "../agents/tools/delegation.js";
import {
  processAgentMessage,
  invokeAgent,
} from "../agents/processor.js";
import { wsManager } from "./manager.js";

// ---------------------------------------------------------------------------
// Types for incoming events
// ---------------------------------------------------------------------------

interface MessageSendPayload {
  channel_id: string;
  content: string;
  author_name?: string;
}

interface AgentInvokePayload {
  agent_name: string;
  message: string;
  channel_id?: string;
  context?: Record<string, unknown>;
}

interface TypingStartPayload {
  channel_id?: string;
  user_name?: string;
}

interface PingPayload {
  timestamp?: number;
}

// ---------------------------------------------------------------------------
// Register handlers on a Socket.IO server
// ---------------------------------------------------------------------------

/**
 * Register all WebSocket event handlers on the Socket.IO server.
 */
export function registerHandlers(io: SocketIOServer): void {
  io.on("connection", (socket: Socket) => {
    // Register connection with manager
    wsManager.connect(socket, "local-dev-user");

    console.log(`[ws] Client connected: ${socket.id}`);

    // -- message_send --
    socket.on("message_send", (data: MessageSendPayload) => {
      void handleMessageSend(socket, data);
    });

    // -- agent_invoke --
    socket.on("agent_invoke", (data: AgentInvokePayload) => {
      void handleAgentInvoke(socket, data);
    });

    // -- typing_start --
    socket.on("typing_start", (data: TypingStartPayload) => {
      handleTypingStart(socket, data);
    });

    // -- ping / pong --
    socket.on("ping", (data: PingPayload) => {
      socket.emit("pong", { timestamp: data?.timestamp });
    });

    // -- get_stats --
    socket.on("get_stats", () => {
      const stats = wsManager.getStats();
      socket.emit("stats_response", stats);
    });

    // -- disconnect --
    socket.on("disconnect", (reason: string) => {
      wsManager.disconnect(socket.id);
      console.log(`[ws] Client disconnected: ${socket.id} (${reason})`);
    });
  });
}

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------

/**
 * Handle message_send: save user message and invoke mentioned agents.
 */
async function handleMessageSend(
  socket: Socket,
  data: MessageSendPayload,
): Promise<void> {
  try {
    const { channel_id, content, author_name } = data;

    if (!channel_id || !content) {
      socket.emit("error", { message: "Missing channel_id or content" });
      return;
    }

    // 1. Save user message to database
    const userMessage = await db
      .insert(messages)
      .values({
        id: randomUUID(),
        channelId: channel_id,
        authorType: "user",
        authorName: author_name ?? "Developer",
        content,
        msgMetadata: {},
      })
      .returning();

    const saved = userMessage[0];
    if (!saved) {
      socket.emit("error", { message: "Failed to save message" });
      return;
    }

    // 2. Broadcast user message to all clients
    wsManager.broadcast("message_new", {
      id: saved.id,
      channel_id: saved.channelId,
      author_type: saved.authorType,
      author_name: saved.authorName,
      content: saved.content,
      created_at: saved.createdAt?.toISOString() ?? new Date().toISOString(),
      thread_id: saved.threadId,
      metadata: saved.msgMetadata ?? {},
    });

    // 3. Extract @mentions and trigger agents
    const mentioned = parseMentions(content);

    if (mentioned.length > 0) {
      // Fire and forget — agent processing runs in background
      void processAgentMessage({
        messageId: saved.id,
        content,
        channelId: channel_id,
        mentionedAgents: mentioned,
      });
    }
  } catch (err) {
    console.error("[ws] Error in message_send:", err);
    socket.emit("error", {
      message: err instanceof Error ? err.message : "Internal error",
    });
  }
}

/**
 * Handle agent_invoke: directly invoke a specific agent.
 */
async function handleAgentInvoke(
  socket: Socket,
  data: AgentInvokePayload,
): Promise<void> {
  try {
    const { agent_name, message, channel_id, context } = data;

    if (!agent_name || !message) {
      socket.emit("error", {
        message: "Missing agent_name or message",
      });
      return;
    }

    const result = await invokeAgent({
      agentName: agent_name,
      message,
      channelId: channel_id,
      context,
    });

    // If no channel, send direct response back to requesting socket
    if (!channel_id) {
      socket.emit("message_new", {
        id: randomUUID(),
        channel_id: null,
        author_type: "agent",
        author_name: `@${result.agentName}`,
        content: result.response,
        created_at: new Date().toISOString(),
        metadata: {},
      });
    }
  } catch (err) {
    console.error("[ws] Error in agent_invoke:", err);
    socket.emit("error", {
      message: err instanceof Error ? err.message : "Agent invocation failed",
    });
  }
}

/**
 * Handle typing_start: broadcast typing indicator.
 */
function handleTypingStart(
  _socket: Socket,
  data: TypingStartPayload,
): void {
  wsManager.broadcast(
    "user_typing",
    {
      channel_id: data.channel_id ?? "",
      user_name: data.user_name ?? "Developer",
    },
    { batch: true },
  );
}
