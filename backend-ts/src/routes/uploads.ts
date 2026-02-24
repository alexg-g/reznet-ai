/**
 * File Upload REST API Routes
 *
 * Fastify plugin exposing 5 endpoints for file upload management.
 * Files are written to the MCP filesystem workspace so agents can access them.
 *
 * Endpoints:
 *   POST   /upload                        - Upload a file (JSON body with base64 content)
 *   GET    /upload                        - List uploaded files
 *   GET    /upload/message/:messageId     - Files attached to a message (registered BEFORE /:fileId)
 *   GET    /upload/:fileId                - Get file metadata by ID
 *   DELETE /upload/:fileId                - Delete file (physical + DB record)
 *
 * Route registration order matters:
 *   /upload/message/:messageId is registered BEFORE /upload/:fileId so the
 *   static segment "message" takes precedence over the ":fileId" wildcard.
 *
 * Security:
 *   - Path traversal blocked (no "..", "/", "\" in filenames)
 *   - Extension whitelist enforced (code, text, image formats only)
 *   - Max 10 MB per file
 *   - Files stored as {uuid}.{ext} under workspace/uploads/YYYY-MM-DD/
 *
 * Python reference: backend/routers/uploads.py
 */

import { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/connection.js";
import { uploadedFiles, messages } from "../db/schema.js";
import { settings } from "../config.js";
import { randomUUID } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import { join, extname } from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  // Code
  ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rs", ".c", ".cpp",
  ".h", ".hpp",
  // Text / data
  ".txt", ".md", ".json", ".yaml", ".yml", ".csv", ".xml",
  // Documents
  ".pdf",
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
]);

/** Root of the MCP-accessible workspace directory. */
const WORKSPACE_ROOT = settings.MCP_FILESYSTEM_WORKSPACE;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate filename: no path traversal, must have an allowed extension.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validateFilename(
  filename: string,
): { valid: true } | { valid: false; reason: string } {
  if (!filename || filename.trim().length === 0) {
    return { valid: false, reason: "Filename is empty" };
  }

  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return { valid: false, reason: "Invalid filename: path traversal detected" };
  }

  const ext = extname(filename).toLowerCase();
  if (!ext) {
    return { valid: false, reason: "File must have an extension" };
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reason: `File type '${ext}' is not allowed. Allowed types: ${Array.from(ALLOWED_EXTENSIONS).sort().join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Guess a MIME type from a file extension.
 * Covers the most common types from our whitelist.
 */
function guessMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".py": "text/x-python",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".jsx": "text/jsx",
    ".tsx": "text/tsx",
    ".java": "text/x-java-source",
    ".go": "text/x-go",
    ".rs": "text/x-rust",
    ".c": "text/x-c",
    ".cpp": "text/x-c++",
    ".h": "text/x-c",
    ".hpp": "text/x-c++",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".csv": "text/csv",
    ".xml": "application/xml",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}

/**
 * Build the daily upload directory path (workspace/uploads/YYYY-MM-DD/)
 * and create it if it does not exist.
 */
async function ensureUploadDir(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const dir = join(WORKSPACE_ROOT, "uploads", today);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function uploadRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /upload
  // Upload a file via JSON body (base64-encoded content).
  // Body: { filename: string, content: string (base64), message_id?: string }
  //
  // 1. Validate filename and extension.
  // 2. Decode base64, check size.
  // 3. Write to workspace/uploads/YYYY-MM-DD/{uuid}.ext
  // 4. Verify message_id if provided.
  // 5. Create DB record.
  // -------------------------------------------------------------------------

  fastify.post<{
    Body: {
      filename: string;
      content: string;
      message_id?: string;
    };
  }>("/upload", async (request, reply) => {
    const { filename, content, message_id } = request.body;

    // Validate filename
    if (!filename || typeof filename !== "string") {
      return reply.status(400).send({ error: "filename is required" });
    }
    const filenameCheck = validateFilename(filename);
    if (!filenameCheck.valid) {
      return reply.status(400).send({ error: filenameCheck.reason });
    }

    // Validate and decode base64 content
    if (!content || typeof content !== "string") {
      return reply.status(400).send({ error: "content is required (base64-encoded file data)" });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(content, "base64");
    } catch {
      return reply.status(400).send({ error: "content must be valid base64-encoded data" });
    }

    if (fileBuffer.length === 0) {
      return reply.status(400).send({ error: "File is empty" });
    }

    if (fileBuffer.length > MAX_FILE_SIZE) {
      return reply.status(400).send({
        error: `File size (${fileBuffer.length} bytes) exceeds the 10 MB limit`,
      });
    }

    // Build file paths
    const ext = extname(filename).toLowerCase();
    const storedFilename = `${randomUUID()}${ext}`;

    let uploadDir: string;
    try {
      uploadDir = await ensureUploadDir();
    } catch (err) {
      fastify.log.error({ err }, "Failed to create upload directory");
      return reply.status(500).send({ error: "Failed to prepare upload directory" });
    }

    const fullPath = join(uploadDir, storedFilename);
    // Relative path from WORKSPACE_ROOT (unix-style, for MCP access)
    const workspacePath = fullPath.slice(WORKSPACE_ROOT.length).replace(/\\/g, "/").replace(/^\//, "");
    const todayStr = new Date().toISOString().slice(0, 10);
    const relativePath = `uploads/${todayStr}/${storedFilename}`;

    // Verify message exists before writing the file (avoid orphan files)
    if (message_id) {
      const [msg] = await db.select().from(messages).where(eq(messages.id, message_id));
      if (!msg) {
        return reply.status(404).send({ error: "Message not found" });
      }
    }

    // Write file to disk
    try {
      await writeFile(fullPath, fileBuffer);
    } catch (err) {
      fastify.log.error({ err, fullPath }, "Failed to write uploaded file");
      return reply.status(500).send({ error: "Failed to save file to disk" });
    }

    // Create DB record
    let fileRecord;
    try {
      const [inserted] = await db
        .insert(uploadedFiles)
        .values({
          originalFilename: filename,
          storedFilename,
          workspacePath: relativePath,
          fileSize: fileBuffer.length,
          mimeType: guessMimeType(filename),
          messageId: message_id ?? null,
          uploadedBy: "local-user",
        })
        .returning();
      fileRecord = inserted;
    } catch (err) {
      // Best-effort cleanup of the file we wrote
      await unlink(fullPath).catch(() => {
        /* ignore cleanup error */
      });
      fastify.log.error({ err }, "Failed to create DB record for uploaded file");
      return reply.status(500).send({ error: "Failed to record file upload" });
    }

    fastify.log.info(`File uploaded: ${filename} -> ${relativePath}`);

    return reply.status(201).send({
      success: true,
      file: fileRecord,
      workspace_path: workspacePath,
      message: `File '${filename}' uploaded successfully`,
    });
  });

  // -------------------------------------------------------------------------
  // GET /upload
  // List uploaded files, ordered by createdAt DESC.
  // Query: limit=50, offset=0
  // -------------------------------------------------------------------------

  fastify.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/upload", async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 500);
    const offset = parseInt(request.query.offset ?? "0", 10);

    if (isNaN(limit) || limit < 0) {
      return reply.status(400).send({ error: "limit must be a non-negative integer" });
    }
    if (isNaN(offset) || offset < 0) {
      return reply.status(400).send({ error: "offset must be a non-negative integer" });
    }

    const rows = await db
      .select()
      .from(uploadedFiles)
      .orderBy(desc(uploadedFiles.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send(rows);
  });

  // -------------------------------------------------------------------------
  // GET /upload/message/:messageId
  // Registered BEFORE /upload/:fileId so "message" is treated as a literal
  // path segment, not matched as a fileId wildcard.
  //
  // Returns all files attached to a specific message.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { messageId: string };
  }>("/upload/message/:messageId", async (request, reply) => {
    const { messageId } = request.params;

    const rows = await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.messageId, messageId))
      .orderBy(uploadedFiles.createdAt);

    return reply.send(rows);
  });

  // -------------------------------------------------------------------------
  // GET /upload/:fileId
  // Get file metadata by UUID. 404 if not found.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { fileId: string };
  }>("/upload/:fileId", async (request, reply) => {
    const { fileId } = request.params;

    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId));
    if (!file) {
      return reply.status(404).send({ error: "File not found" });
    }

    return reply.send(file);
  });

  // -------------------------------------------------------------------------
  // DELETE /upload/:fileId
  // Delete a file: remove physical file from disk and then delete DB record.
  // 404 if the DB record is not found.
  // Physical deletion failure is logged but does NOT block the DB record removal.
  // -------------------------------------------------------------------------

  fastify.delete<{
    Params: { fileId: string };
  }>("/upload/:fileId", async (request, reply) => {
    const { fileId } = request.params;

    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId));
    if (!file) {
      return reply.status(404).send({ error: "File not found" });
    }

    // Attempt to remove physical file
    const fullPath = join(WORKSPACE_ROOT, file.workspacePath);
    try {
      await unlink(fullPath);
      fastify.log.info(`Deleted physical file: ${fullPath}`);
    } catch (err) {
      fastify.log.warn({ err, fullPath }, "Could not delete physical file — proceeding with DB removal");
    }

    // Remove DB record
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, fileId));

    fastify.log.info(`File record deleted: ${file.originalFilename} (${fileId})`);
    return reply.send({
      success: true,
      message: `File '${file.originalFilename}' deleted successfully`,
    });
  });
}
