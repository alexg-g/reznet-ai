/**
 * Drizzle ORM Database Schema
 *
 * Ports the SQLAlchemy models from /backend/models/database.py to TypeScript.
 * Table names are identical to the Python implementation so Drizzle reads the
 * existing PostgreSQL tables without requiring a schema migration.
 *
 * Notes:
 * - `embedding` uses Drizzle's native vector() type (drizzle-orm >= 0.36)
 *   which maps to PostgreSQL's vector(768) from the pgvector extension.
 * - `msg_metadata` and `mem_metadata` in the Python models are stored under
 *   the column name "metadata" in the database; the columnName option preserves
 *   that mapping here.
 * - All JSONB defaults use $default() (application-side) rather than
 *   .default() (SQL-side) so TypeScript receives typed values on insert.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).default("Local Workspace"),
  settings: jsonb("settings").$default(() => ({})),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    agentType: varchar("agent_type", { length: 50 }).notNull(),
    persona: jsonb("persona").notNull(),
    config: jsonb("config").$default(() => ({})),
    isActive: boolean("is_active").default(true),
    /** UUID of the task currently being processed (nullable). */
    currentTaskId: uuid("current_task_id"),
    /** Quick availability flag -- avoids a task-table join. */
    isBusy: boolean("is_busy").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_agents_name").on(table.name),
    index("idx_agents_type").on(table.agentType),
    index("idx_agents_active").on(table.isActive),
    index("idx_agents_type_active").on(table.agentType, table.isActive),
  ],
);

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  topic: text("topic"),
  isArchived: boolean("is_archived").default(false),
  contextClearedAt: timestamp("context_cleared_at", { withTimezone: true }),
  /** 'public' | 'dm' | 'private' */
  channelType: varchar("channel_type", { length: 20 })
    .notNull()
    .default("public"),
  /** For DM channels: the agent this channel belongs to. CASCADE on agent delete. */
  dmAgentId: uuid("dm_agent_id").references(() => agents.id, {
    onDelete: "cascade",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    authorId: uuid("author_id"),
    /** 'user' or 'agent' */
    authorType: varchar("author_type", { length: 10 }).notNull(),
    authorName: varchar("author_name", { length: 100 }),
    content: text("content").notNull(),
    /** Self-referencing FK for threading. */
    threadId: uuid("thread_id").references((): AnyPgColumn => messages.id),
    /**
     * Python attribute: msg_metadata
     * Stored in DB under column name: metadata
     */
    msgMetadata: jsonb("metadata").$default(() => ({})),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_messages_channel_id").on(table.channelId),
    index("idx_messages_created_at").on(table.createdAt),
    index("idx_messages_author_id").on(table.authorId),
    index("idx_messages_channel_created").on(table.channelId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  description: text("description").notNull(),
  assignedTo: uuid("assigned_to").references(() => agents.id),
  status: varchar("status", { length: 50 }).default("pending"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  context: jsonb("context").$default(() => ({})),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// AgentMemory
// ---------------------------------------------------------------------------

export const agentMemories = pgTable("agent_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").references(() => channels.id, {
    onDelete: "cascade",
  }),

  content: text("content").notNull(),
  /**
   * nomic-embed-text embeddings via Ollama (768 dimensions).
   * Uses Drizzle's native vector() type which maps to PostgreSQL vector(768).
   * Same vector format as the Python implementation -- no re-embedding needed.
   */
  embedding: vector("embedding", { dimensions: 768 }),

  /** 'conversation' | 'decision' | 'entity' | 'summary' | 'tool_use' */
  memoryType: varchar("memory_type", { length: 50 }).default("conversation"),
  /** 1-10 scale; affects retrieval priority. */
  importance: integer("importance").default(5),

  /**
   * Python attribute: mem_metadata
   * Stored in DB under column name: metadata
   */
  memMetadata: jsonb("metadata").$default(() => ({})),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  /** Updated on every retrieval (tracks last access). */
  accessedAt: timestamp("accessed_at", { withTimezone: true }).defaultNow(),
  /** Incremented on each retrieval for importance scoring. */
  accessCount: integer("access_count").default(0),
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    description: text("description").notNull(),
    orchestratorId: uuid("orchestrator_id")
      .notNull()
      .references(() => agents.id),
    channelId: uuid("channel_id").references(() => channels.id),
    /** 'pending' | 'planning' | 'executing' | 'completed' | 'failed' */
    status: varchar("status", { length: 50 }).default("pending"),
    /** 'sequential' | 'parallel' | 'dag' */
    executionStrategy: varchar("execution_strategy", { length: 50 }).default(
      "sequential",
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_workflows_status").on(table.status),
    index("idx_workflows_created_at").on(table.createdAt),
    index("idx_workflows_channel_id").on(table.channelId),
    index("idx_workflows_status_created").on(table.status, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// WorkflowTask
// ---------------------------------------------------------------------------

export const workflowTasks = pgTable(
  "workflow_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    orderIndex: integer("order_index").notNull(),
    /** List of upstream workflow_task UUIDs that must complete first. */
    dependsOn: jsonb("depends_on").$default(() => [] as string[]),
    status: varchar("status", { length: 50 }).default("pending"),
    output: jsonb("output"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_workflow_tasks_workflow_id").on(table.workflowId),
    index("idx_workflow_tasks_status").on(table.status),
    index("idx_workflow_tasks_order").on(table.orderIndex),
    index("idx_workflow_tasks_workflow_status").on(
      table.workflowId,
      table.status,
    ),
  ],
);

// ---------------------------------------------------------------------------
// UploadedFile
// ---------------------------------------------------------------------------

export const uploadedFiles = pgTable("uploaded_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  storedFilename: varchar("stored_filename", { length: 255 }).notNull(),
  /** Relative path in workspace: "uploads/YYYY-MM-DD/uuid.ext" */
  workspacePath: text("workspace_path").notNull(),
  /** Size in bytes. */
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  messageId: uuid("message_id").references(() => messages.id, {
    onDelete: "cascade",
  }),
  /** User identifier (placeholder for future multi-user support). */
  uploadedBy: varchar("uploaded_by", { length: 100 }).default("local-user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// AgentTemplate
// ---------------------------------------------------------------------------

export const agentTemplates = pgTable("agent_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Unique machine-readable name (alphanumeric, lowercase). */
  name: varchar("name", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  role: varchar("role", { length: 200 }).notNull(),
  systemPrompt: text("system_prompt").notNull(),
  /** Hex color code e.g. "#FF0000". */
  color: varchar("color", { length: 7 }),
  /** Emoji or icon name. */
  icon: varchar("icon", { length: 10 }),
  /** List of MCP server names available to this template. */
  availableTools: jsonb("available_tools").$default(() => [] as string[]),
  /** Provider, model, temperature overrides. */
  llmConfig: jsonb("llm_config").$default(() => ({})),
  /** 'default' | 'custom' | 'community' */
  templateType: varchar("template_type", { length: 50 }).default("custom"),
  /** Category: software-dev, marketing, legal, etc. */
  domain: varchar("domain", { length: 100 }),
  isPublic: boolean("is_public").default(false),
  /** User ID or 'system'. */
  createdBy: varchar("created_by", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const agentsRelations = relations(agents, ({ many }) => ({
  tasks: many(tasks),
  memories: many(agentMemories),
  dmChannels: many(channels),
  workflowTasks: many(workflowTasks),
  orchestratedWorkflows: many(workflows),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  dmAgent: one(agents, {
    fields: [channels.dmAgentId],
    references: [agents.id],
  }),
  messages: many(messages),
  workflows: many(workflows),
  agentMemories: many(agentMemories),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  threadParent: one(messages, {
    fields: [messages.threadId],
    references: [messages.id],
    relationName: "threadReplies",
  }),
  threadReplies: many(messages, { relationName: "threadReplies" }),
  uploadedFiles: many(uploadedFiles),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  agent: one(agents, {
    fields: [tasks.assignedTo],
    references: [agents.id],
  }),
}));

export const agentMemoriesRelations = relations(agentMemories, ({ one }) => ({
  agent: one(agents, {
    fields: [agentMemories.agentId],
    references: [agents.id],
  }),
  channel: one(channels, {
    fields: [agentMemories.channelId],
    references: [channels.id],
  }),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  orchestrator: one(agents, {
    fields: [workflows.orchestratorId],
    references: [agents.id],
  }),
  channel: one(channels, {
    fields: [workflows.channelId],
    references: [channels.id],
  }),
  workflowTasks: many(workflowTasks),
}));

export const workflowTasksRelations = relations(workflowTasks, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowTasks.workflowId],
    references: [workflows.id],
  }),
  agent: one(agents, {
    fields: [workflowTasks.agentId],
    references: [agents.id],
  }),
}));

export const uploadedFilesRelations = relations(uploadedFiles, ({ one }) => ({
  message: one(messages, {
    fields: [uploadedFiles.messageId],
    references: [messages.id],
  }),
}));

// agentTemplates has no relations in the Python model -- standalone table.

// ---------------------------------------------------------------------------
// Inferred TypeScript types (select and insert shapes)
// ---------------------------------------------------------------------------

export type Workspace = typeof workspace.$inferSelect;
export type NewWorkspace = typeof workspace.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type AgentMemory = typeof agentMemories.$inferSelect;
export type NewAgentMemory = typeof agentMemories.$inferInsert;

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

export type WorkflowTask = typeof workflowTasks.$inferSelect;
export type NewWorkflowTask = typeof workflowTasks.$inferInsert;

export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type NewUploadedFile = typeof uploadedFiles.$inferInsert;

export type AgentTemplate = typeof agentTemplates.$inferSelect;
export type NewAgentTemplate = typeof agentTemplates.$inferInsert;
