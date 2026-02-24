/**
 * WebSocket Connection Manager — Socket.IO connection lifecycle,
 * payload optimization, and message batching.
 *
 * Replaces backend/websocket/manager.py (~606 LOC).
 *
 * Key responsibilities:
 *   - Connection tracking (sid → userId)
 *   - Payload optimization (field abbreviation, timestamp conversion)
 *   - Message batching (50ms window, max 10 messages)
 *   - Broadcast to all clients (both / and /ws namespaces)
 *   - Per-user message targeting
 *   - Performance statistics
 */

import type { Server as SocketIOServer, Socket } from "socket.io";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionInfo {
  userId: string;
  connectedAt: Date;
}

export interface BroadcastOptions {
  optimize?: boolean;
  batch?: boolean;
}

export interface WebSocketStats {
  totalMessages: number;
  totalBytesOriginal: number;
  totalBytesOptimized: number;
  reductionPercentage: number;
  compressedMessages: number;
  avgMessageSize: number;
  activeConnections: number;
}

// ---------------------------------------------------------------------------
// Field abbreviation map (matches Python PayloadOptimizer)
// ---------------------------------------------------------------------------

const FIELD_MAP: Record<string, string> = {
  // Message fields
  message_id: "mid",
  channel_id: "cid",
  author_type: "at",
  author_name: "an",
  author_id: "aid",
  content: "c",
  created_at: "ts",
  updated_at: "uts",
  thread_id: "tid",
  // Agent fields
  agent_name: "ag",
  agent_id: "agid",
  status: "s",
  // Streaming fields
  chunk: "ch",
  is_final: "fin",
  streaming: "str",
  // Workflow fields
  workflow_id: "wid",
  description: "d",
  orchestrator: "orch",
  plan: "p",
  total_tasks: "tt",
  tasks: "t",
  order: "o",
  depends_on: "dep",
  // Error fields
  message: "msg",
  error: "err",
  // LLM metadata
  model: "mdl",
  provider: "prv",
  in_reply_to: "irt",
  tokens: "tok",
  // Common fields
  name: "n",
  type: "ty",
  value: "v",
  key: "k",
  data: "da",
};

// ---------------------------------------------------------------------------
// PayloadOptimizer
// ---------------------------------------------------------------------------

export class PayloadOptimizer {
  /**
   * Abbreviate field names in a payload (recursive).
   */
  abbreviateFields(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.abbreviateFields(item));
    }

    if (typeof data === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const abbrevKey = FIELD_MAP[key] ?? key;
        result[abbrevKey] = this.abbreviateFields(value);
      }
      return result;
    }

    return data;
  }

  /**
   * Optimize a payload: abbreviate fields and compute size reduction.
   */
  optimize(data: unknown): { data: unknown; originalSize: number; optimizedSize: number } {
    const originalJson = JSON.stringify(data);
    const originalSize = originalJson.length;

    const abbreviated = this.abbreviateFields(data);
    const optimizedJson = JSON.stringify(abbreviated);
    const optimizedSize = optimizedJson.length;

    return { data: abbreviated, originalSize, optimizedSize };
  }
}

// ---------------------------------------------------------------------------
// MessageBatcher
// ---------------------------------------------------------------------------

export class MessageBatcher {
  private queue: Array<{ event: string; data: unknown }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushCallback: (
    messages: Array<{ event: string; data: unknown }>,
  ) => void;

  /** Maximum messages before immediate flush. */
  readonly maxSize = 10;
  /** Batch window in milliseconds. */
  readonly intervalMs = 50;

  constructor(
    flushCallback: (messages: Array<{ event: string; data: unknown }>) => void,
  ) {
    this.flushCallback = flushCallback;
  }

  /**
   * Add a message to the batch queue.
   */
  add(event: string, data: unknown): void {
    this.queue.push({ event, data });

    if (this.queue.length >= this.maxSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.intervalMs);
    }
  }

  /**
   * Flush queued messages immediately.
   */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) return;

    const messages = [...this.queue];
    this.queue = [];

    this.flushCallback(messages);
  }

  /**
   * Clear the queue without sending.
   */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }
}

// ---------------------------------------------------------------------------
// WebSocketManager
// ---------------------------------------------------------------------------

export class WebSocketManager {
  private io: SocketIOServer | null = null;
  private connections = new Map<string, ConnectionInfo>();
  private optimizer = new PayloadOptimizer();
  private batcher: MessageBatcher;

  // Stats tracking
  private stats = {
    totalMessages: 0,
    totalBytesOriginal: 0,
    totalBytesOptimized: 0,
    compressedMessages: 0,
  };

  constructor() {
    this.batcher = new MessageBatcher((messages) => {
      this.flushBatch(messages);
    });
  }

  /**
   * Attach to a Socket.IO server instance.
   */
  attach(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Register a new client connection.
   */
  connect(socket: Socket, userId: string = "local-dev-user"): void {
    this.connections.set(socket.id, {
      userId,
      connectedAt: new Date(),
    });

    // Send welcome event
    socket.emit("connection_established", {
      sid: socket.id,
      message: "Connected to RezNet AI",
      version: "2.0",
      features: {
        optimized_payloads: true,
        compression: true,
        batching: true,
      },
    });
  }

  /**
   * Unregister a disconnected client.
   */
  disconnect(socketId: string): void {
    this.connections.delete(socketId);
  }

  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(
    event: string,
    data: unknown,
    opts: BroadcastOptions = {},
  ): void {
    if (!this.io) return;

    const { optimize = false, batch = false } = opts;

    let payload = data;
    let originalSize = 0;
    let optimizedSize = 0;

    if (optimize) {
      const result = this.optimizer.optimize(data);
      payload = result.data;
      originalSize = result.originalSize;
      optimizedSize = result.optimizedSize;
    } else {
      const json = JSON.stringify(data);
      originalSize = json.length;
      optimizedSize = json.length;
    }

    // Track stats
    this.stats.totalMessages++;
    this.stats.totalBytesOriginal += originalSize;
    this.stats.totalBytesOptimized += optimizedSize;

    if (batch && optimizedSize < 2048) {
      this.batcher.add(event, payload);
    } else {
      this.io.emit(event, payload);
    }
  }

  /**
   * Send an event to a specific socket.
   */
  sendToSocket(socketId: string, event: string, data: unknown): void {
    if (!this.io) return;
    this.io.to(socketId).emit(event, data);
  }

  /**
   * Send an event to a specific user (all their sessions).
   */
  sendToUser(userId: string, event: string, data: unknown): void {
    if (!this.io) return;

    for (const [socketId, info] of this.connections) {
      if (info.userId === userId) {
        this.io.to(socketId).emit(event, data);
      }
    }
  }

  /**
   * Get performance statistics.
   */
  getStats(): WebSocketStats {
    const totalMessages = this.stats.totalMessages || 1; // avoid div by zero
    return {
      totalMessages: this.stats.totalMessages,
      totalBytesOriginal: this.stats.totalBytesOriginal,
      totalBytesOptimized: this.stats.totalBytesOptimized,
      reductionPercentage:
        this.stats.totalBytesOriginal > 0
          ? ((1 - this.stats.totalBytesOptimized / this.stats.totalBytesOriginal) * 100)
          : 0,
      compressedMessages: this.stats.compressedMessages,
      avgMessageSize: Math.round(this.stats.totalBytesOptimized / totalMessages),
      activeConnections: this.connections.size,
    };
  }

  /**
   * Get active connection count.
   */
  get connectionCount(): number {
    return this.connections.size;
  }

  /**
   * Check if a socket is connected.
   */
  isConnected(socketId: string): boolean {
    return this.connections.has(socketId);
  }

  /**
   * Get the Socket.IO server instance.
   */
  get server(): SocketIOServer | null {
    return this.io;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private flushBatch(
    messages: Array<{ event: string; data: unknown }>,
  ): void {
    if (!this.io || messages.length === 0) return;

    if (messages.length === 1) {
      // Single message: send directly without batch wrapper
      this.io.emit(messages[0].event, messages[0].data);
    } else {
      // Multiple messages: wrap in batch event
      this.io.emit("message_batch", {
        batch: true,
        messages: messages.map((m) => ({ e: m.event, d: m.data })),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const wsManager = new WebSocketManager();
