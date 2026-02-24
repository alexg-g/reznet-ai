/**
 * Workspace-constrained filesystem tools for agent use.
 *
 * Replaces backend/agents/tool_schemas.py (377 LOC) + mcp_client.py (334 LOC).
 *
 * All file operations are sandboxed to the configured MCP_FILESYSTEM_WORKSPACE
 * directory. Paths are resolved and validated to prevent directory traversal.
 *
 * Uses pi-agent-core's AgentTool interface with @sinclair/typebox schemas.
 */

import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import * as fs from "fs/promises";
import * as path from "path";
import { settings } from "../../config.js";

// ---------------------------------------------------------------------------
// Path sandboxing
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = path.resolve(settings.MCP_FILESYSTEM_WORKSPACE);

/**
 * Resolve a user-provided path against the workspace root.
 * Throws if the resolved path escapes the workspace directory.
 */
function resolveSafePath(userPath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, userPath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(
      `Path "${userPath}" resolves outside workspace. Access denied.`,
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const readFileTool: AgentTool = {
  name: "read_file",
  label: "Read File",
  description:
    "Read the contents of a file at the given path within the workspace.",
  parameters: Type.Object({
    path: Type.String({ description: "File path relative to workspace root" }),
  }),
  execute: async (_toolCallId, _params) => {
    const params = _params as { path: string };
    const safePath = resolveSafePath(params.path);
    const content = await fs.readFile(safePath, "utf-8");
    return {
      content: [{ type: "text", text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};

export const writeFileTool: AgentTool = {
  name: "write_file",
  label: "Write File",
  description:
    "Write content to a file at the given path within the workspace. Creates parent directories if needed.",
  parameters: Type.Object({
    path: Type.String({ description: "File path relative to workspace root" }),
    content: Type.String({ description: "Content to write to the file" }),
  }),
  execute: async (_toolCallId, _params) => {
    const params = _params as { path: string; content: string };
    const safePath = resolveSafePath(params.path);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, params.content, "utf-8");
    return {
      content: [
        { type: "text", text: `File written: ${params.path} (${params.content.length} bytes)` },
      ],
      details: { path: params.path, size: params.content.length },
    };
  },
};

export const listDirectoryTool: AgentTool = {
  name: "list_directory",
  label: "List Directory",
  description:
    "List files and directories at the given path within the workspace.",
  parameters: Type.Object({
    path: Type.String({
      description: "Directory path relative to workspace root (empty string for root)",
      default: "",
    }),
  }),
  execute: async (_toolCallId, _params) => {
    const params = _params as { path: string };
    const safePath = resolveSafePath(params.path || "");
    const entries = await fs.readdir(safePath, { withFileTypes: true });
    const listing = entries
      .map((e) => `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`)
      .join("\n");
    return {
      content: [{ type: "text", text: listing || "(empty directory)" }],
      details: { path: params.path, count: entries.length },
    };
  },
};

export const createDirectoryTool: AgentTool = {
  name: "create_directory",
  label: "Create Directory",
  description:
    "Create a directory (and parent directories) at the given path within the workspace.",
  parameters: Type.Object({
    path: Type.String({ description: "Directory path relative to workspace root" }),
  }),
  execute: async (_toolCallId, _params) => {
    const params = _params as { path: string };
    const safePath = resolveSafePath(params.path);
    await fs.mkdir(safePath, { recursive: true });
    return {
      content: [{ type: "text", text: `Directory created: ${params.path}` }],
      details: { path: params.path },
    };
  },
};

export const deleteFileTool: AgentTool = {
  name: "delete_file",
  label: "Delete File",
  description: "Delete a file at the given path within the workspace.",
  parameters: Type.Object({
    path: Type.String({ description: "File path relative to workspace root" }),
  }),
  execute: async (_toolCallId, _params) => {
    const params = _params as { path: string };
    const safePath = resolveSafePath(params.path);
    await fs.unlink(safePath);
    return {
      content: [{ type: "text", text: `File deleted: ${params.path}` }],
      details: { path: params.path },
    };
  },
};

export const fileExistsTool: AgentTool = {
  name: "file_exists",
  label: "Check File Exists",
  description:
    "Check whether a file or directory exists at the given path within the workspace.",
  parameters: Type.Object({
    path: Type.String({ description: "Path relative to workspace root" }),
  }),
  execute: async (_toolCallId, _params) => {
    const params = _params as { path: string };
    const safePath = resolveSafePath(params.path);
    try {
      const stat = await fs.stat(safePath);
      const kind = stat.isDirectory() ? "directory" : "file";
      return {
        content: [{ type: "text", text: `Exists (${kind}): ${params.path}` }],
        details: { path: params.path, exists: true, kind },
      };
    } catch {
      return {
        content: [{ type: "text", text: `Does not exist: ${params.path}` }],
        details: { path: params.path, exists: false },
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Tool collections
// ---------------------------------------------------------------------------

/** All filesystem tools. */
export const filesystemTools: AgentTool[] = [
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  createDirectoryTool,
  deleteFileTool,
  fileExistsTool,
];

/** Workspace root path for external access. */
export { WORKSPACE_ROOT };
