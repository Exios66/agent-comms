import { z } from "zod";

export const handleSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[a-z][a-z0-9_-]{1,31}$/, "handle must be lowercase letters, digits, _ or -");

export const projectSchema = z.string().trim().min(1).max(64);
export const machineSchema = z.string().trim().min(1).max(64);
export const bodySchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((value) => !looksLikeDocumentDump(value), {
    message: "body looks like document contents — coordination hub is metadata only",
  });

export const filePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine((value) => !value.includes("\0"), { message: "invalid file path" })
  .refine((value) => !looksLikeDocumentDump(value), {
    message: "file_path must be a path, not file contents",
  });

export const relatedFilesSchema = z.array(filePathSchema).max(32).default([]);

export const agentStatusSchema = z.enum(["idle", "working", "blocked"]);
export const postTypeSchema = z.enum(["status", "completed", "blocked", "handoff"]);

export const registerAgentSchema = z.object({
  handle: handleSchema,
  machineLabel: machineSchema,
  project: projectSchema,
  status: agentStatusSchema.optional(),
});

export const heartbeatSchema = z.object({
  status: agentStatusSchema.optional(),
  project: projectSchema.optional(),
});

export const postUpdateSchema = z.object({
  type: postTypeSchema,
  body: bodySchema,
  project: projectSchema.optional(),
  relatedFiles: relatedFilesSchema.optional(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4096).optional(),
  project: projectSchema.optional(),
});

export const leaseFileSchema = z.object({
  filePath: filePathSchema,
  project: projectSchema.optional(),
  ttlSeconds: z.number().int().min(5).max(86_400).optional(),
});

export const handoffTaskSchema = z.object({
  toHandle: handleSchema,
  contextSummary: bodySchema,
  taskId: z.string().uuid().optional(),
});

export const listQuerySchema = z.object({
  project: projectSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
  unreadOnly: z.boolean().optional(),
  inbox: z.boolean().optional(),
});

export const sendMessageSchema = z
  .object({
    toHandle: handleSchema.optional(),
    threadId: z.string().uuid().optional(),
    body: bodySchema,
    subject: z.string().trim().max(200).optional(),
    project: projectSchema.optional(),
    kind: z.enum(["ping", "message", "reply"]).optional(),
  })
  .refine((value) => Boolean(value.toHandle || value.threadId), {
    message: "toHandle or threadId is required",
  });

export const sendPingSchema = z.object({
  toHandle: handleSchema,
  body: bodySchema,
  project: projectSchema.optional(),
});

export const threadIdInput = z.object({ threadId: z.string().uuid() });

export const idSchema = z.string().uuid();

export function looksLikeDocumentDump(value: string): boolean {
  if (value.length > 2048 && value.includes("\n".repeat(3))) return true;
  const newlines = (value.match(/\n/g) ?? []).length;
  return newlines >= 40 && value.length > 1200;
}

export const loginSchema = z.object({
  handle: handleSchema,
  token: z.string().min(8).max(256),
});
