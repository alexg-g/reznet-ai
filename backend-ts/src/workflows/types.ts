/**
 * Workflow Orchestration Types
 *
 * Shared types for the workflow engine, parser, and related modules.
 */

// ---------------------------------------------------------------------------
// Status enums (string unions matching DB column values)
// ---------------------------------------------------------------------------

export type WorkflowStatus =
  | "pending"
  | "planning"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

// ---------------------------------------------------------------------------
// Parsed plan types (output of parser.ts)
// ---------------------------------------------------------------------------

/**
 * A single task parsed from the orchestrator's plan text.
 * `taskNumber` is 1-indexed (matches "Task 1", "Task 2", etc.).
 * `dependsOnNumbers` are raw task numbers from the plan text.
 */
export interface ParsedTask {
  taskNumber: number;
  agentName: string;
  description: string;
  dependsOnNumbers: number[];
}

// ---------------------------------------------------------------------------
// Execution types
// ---------------------------------------------------------------------------

/**
 * Execution strategy determined from task dependency graph.
 */
export type ExecutionStrategy = "sequential" | "parallel" | "dag";

/**
 * Result of a single task execution.
 */
export interface TaskExecutionResult {
  taskId: string;
  agentName: string;
  response: string;
}

/**
 * Aggregated results after workflow completion.
 */
export interface WorkflowResults {
  summary: string;
  completedTasks: number;
  totalTasks: number;
  durationSeconds: number | null;
  agentContributions: Record<string, string>;
}

/**
 * Progress snapshot for WebSocket broadcast.
 */
export interface WorkflowProgress {
  workflowId: string;
  completed: number;
  total: number;
  percent: number;
}
