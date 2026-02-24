/**
 * Workflow Plan Parser
 *
 * Parses the orchestrator's natural-language plan into structured tasks.
 *
 * Expected format from the orchestrator:
 *   Task 1: @backend - Design database schema
 *   Task 2: @backend - Implement API endpoints (depends on Task 1)
 *   Task 3: @frontend - Build UI components
 *   Task 4: @qa - Write tests (depends on Task 1, Task 2)
 *
 * Handles optional markdown formatting (bold, headers, list markers).
 */

import type { ParsedTask, ExecutionStrategy } from "./types.js";

// ---------------------------------------------------------------------------
// Markdown stripping (simplified version of Python strip_markdown)
// ---------------------------------------------------------------------------

/**
 * Strip common markdown formatting from a line of text.
 * Preserves @mentions and content.
 */
export function stripMarkdown(text: string): string {
  if (!text) return text;

  let result = text;

  // Remove bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/__(.+?)__/g, "$1");

  // Remove strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "$1");

  // Remove italic: *text* or _text_ (preserve @mentions)
  result = result.replace(/(?<!@)\*(?!\*)(.+?)\*/g, "$1");
  result = result.replace(/(?<!@)_(?!_)(.+?)_/g, "$1");

  // Remove inline code: `code`
  result = result.replace(/`([^`]+)`/g, "$1");

  // Remove headers: # Header, ## Header, etc.
  result = result.replace(/^#{1,6}\s+/gm, "");

  // Remove blockquotes: > text
  result = result.replace(/^>\s*/gm, "");

  // Remove list markers: -, *, 1.
  result = result.replace(/^\s*[-*+]\s+/gm, "");
  result = result.replace(/^\s*\d+\.\s+/gm, "");

  return result.trim();
}

// ---------------------------------------------------------------------------
// Plan parser
// ---------------------------------------------------------------------------

/**
 * Task line regex.
 *
 * Captures:
 *   1. Task number
 *   2. Agent name (without @)
 *   3. Description
 *   4. Dependency string (optional)
 *
 * Example matches:
 *   "Task 1: @backend - Design database schema"
 *   "Task 2: @frontend - Build UI (depends on Task 1)"
 *   "Task 3: @qa - Write tests (depends on Task 1, Task 2)"
 */
const TASK_PATTERN =
  /Task\s+(\d+):\s*@(\w+)\s*-\s*(.+?)(?:\(depends on\s+(.+?)\))?$/i;

/**
 * Dependency extraction regex — finds "Task N" references in depends_on string.
 */
const DEP_PATTERN = /Task\s+(\d+)/gi;

/**
 * Parse the orchestrator's plan text into structured tasks.
 *
 * @param planText - Raw text response from the orchestrator
 * @returns Array of parsed tasks (may be empty if no valid tasks found)
 */
export function parsePlanText(planText: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = planText.split("\n");

  for (const rawLine of lines) {
    const line = stripMarkdown(rawLine.trim());
    const match = line.match(TASK_PATTERN);

    if (!match) continue;

    const taskNumber = parseInt(match[1], 10);
    const agentName = match[2].toLowerCase();
    const description = match[3].trim();
    const dependsStr = match[4] ?? "";

    // Extract dependency task numbers
    const dependsOnNumbers: number[] = [];
    if (dependsStr) {
      let depMatch: RegExpExecArray | null;
      // Reset regex state
      DEP_PATTERN.lastIndex = 0;
      while ((depMatch = DEP_PATTERN.exec(dependsStr)) !== null) {
        dependsOnNumbers.push(parseInt(depMatch[1], 10));
      }
    }

    tasks.push({
      taskNumber,
      agentName,
      description,
      dependsOnNumbers,
    });
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Execution strategy detection
// ---------------------------------------------------------------------------

/**
 * Determine execution strategy from parsed tasks.
 *
 * - "parallel": no tasks have dependencies → all run concurrently
 * - "sequential": every dependency is a simple chain (each task depends on at most 1 other)
 * - "dag": complex dependency graph
 */
export function determineExecutionStrategy(
  tasks: ParsedTask[],
): ExecutionStrategy {
  const hasDependencies = tasks.some((t) => t.dependsOnNumbers.length > 0);

  if (!hasDependencies) {
    return "parallel";
  }

  // Check if all dependencies form a simple chain
  const allSimple = tasks.every((t) => t.dependsOnNumbers.length <= 1);
  if (allSimple) {
    return "sequential";
  }

  return "dag";
}

// ---------------------------------------------------------------------------
// Planning prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the planning prompt sent to the orchestrator agent.
 *
 * Mirrors the Python `_build_planning_prompt()` exactly.
 */
export function buildPlanningPrompt(userRequest: string): string {
  return `Create a detailed task plan for this request:

${userRequest}

Break this down into specific, actionable tasks. For each task:
1. Assign it to the appropriate agent (@backend, @frontend, @qa, @devops)
2. Provide a clear description of what needs to be done
3. **ALWAYS include the file path where code should be written**
4. Identify any dependencies on other tasks

Use this EXACT format (very important):

Task 1: @agent_name - Description of task 1 in path/to/file.ext
Task 2: @agent_name - Description of task 2 in path/to/file2.ext (depends on Task 1)
Task 3: @agent_name - Description of task 3 in path/to/file3.ext
Task 4: @agent_name - Description of task 4 in path/to/file4.ext (depends on Task 2, Task 3)

Guidelines:
- Number tasks sequentially starting from 1
- Always specify agent with @ symbol
- **CRITICAL: Include file paths in every task description** (e.g., "in backend/app.py" or "in frontend/App.tsx")
- Keep descriptions specific and actionable
- Only add dependencies if task actually requires previous task outputs
- Think about what can run in parallel vs. sequentially
- Agents will create actual files at these paths, so be specific!

Example:
Task 1: @backend - Create Flask application with /flip endpoint in backend/app.py
Task 2: @frontend - Build CoinFlip React component with flip button in frontend/src/CoinFlip.tsx
Task 3: @qa - Write unit tests for flip endpoint in tests/test_app.py (depends on Task 1)

Create the plan now:`;
}
