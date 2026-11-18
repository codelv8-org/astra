import { z } from "zod";
export const remoteCommand = z
  .object({
    command_id: z.string().uuid(),
    device_id: z.string().uuid(),
    project_id: z.string().uuid(),
    task_id: z.string().uuid(),
    action: z.enum(["submit", "start", "cancel", "pause_scheduling", "status"]),
    requested_by: z.string().uuid(),
    issued_at: z.iso.datetime(),
    expires_at: z.iso.datetime(),
    idempotency_key: z.string().min(1).max(200),
    authorization_context: z
      .object({
        approval_id: z.string().uuid().nullable(),
      })
      .strict(),
    payload: z
      .object({
        agentId: z.enum(["astra", "forge", "mira", "vector", "scout"]),
        adapter: z.enum(["mock", "codex", "claude", "antigravity"]),
        title: z.string().trim().min(1).max(100),
        prompt: z.string().trim().min(1).max(4000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (c) => Date.parse(c.expires_at) > Date.parse(c.issued_at),
    "Invalid command lifetime",
  );
export type RemoteCommand = z.infer<typeof remoteCommand>;

export const remoteSnapshot = z
  .object({
    projects: z
      .array(
        z.object({ id: z.string().uuid(), name: z.string().max(100) }).strict(),
      )
      .max(100),
    tasks: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            projectId: z.string().uuid(),
            agentId: z.string().max(100),
            adapter: z.string().max(30),
            title: z.string().max(100),
            status: z.string().max(40),
            approved: z.boolean(),
            gate: z.boolean(),
            attempts: z.number().int().nonnegative(),
            lastExecutionId: z.string().uuid().nullable(),
            dependencies: z.array(z.string().uuid()).max(100),
            workflowId: z.string().uuid().nullable(),
          })
          .strict(),
      )
      .max(500),
    workflows: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            projectId: z.string().uuid(),
            objective: z.string().max(300),
            status: z.string().max(40),
            reworkCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(50),
    executions: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            taskId: z.string().uuid(),
            projectId: z.string().uuid(),
            agentId: z.string().max(100),
            adapter: z.string().max(30),
            status: z.string().max(40),
          })
          .strict(),
      )
      .max(100),
    schedulerPaused: z.boolean(),
  })
  .strict();
export type RemoteSnapshot = z.infer<typeof remoteSnapshot>;
export const commandRequest = z
  .object({
    projectId: z.string().uuid(),
    taskId: z.string().uuid(),
    action: z.enum(["submit", "start", "cancel", "pause_scheduling", "status"]),
    idempotencyKey: z.string().min(1).max(100),
    payload: remoteCommand.shape.payload,
  })
  .strict();
