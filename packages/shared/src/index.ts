import { z } from "zod";

export const taskStates = [
  "draft",
  "ready",
  "queued",
  "running",
  "blocked",
  "needs_review",
  "completed",
  "failed",
  "canceled",
] as const;
export const projectInput = z.object({
  name: z.string().trim().min(1).max(100),
  goal: z.string().trim().max(4000),
});
export const runInput = z.object({
  projectId: z.string().uuid(),
  agentId: z.string().min(1),
  adapter: z.enum(["mock", "codex", "claude", "antigravity"]),
  prompt: z.string().trim().min(1).max(8000),
  approved: z.literal(true),
});
export type AdapterId = "mock" | "codex" | "claude" | "antigravity";
export interface Agent {
  id: string;
  name: string;
  characterKey: string;
  role: string;
  description: string;
  supervisorId: string | null;
  runtimeAdapter: AdapterId;
  model: string | null;
  workspacePermissions: string[];
  instructions: string;
  capabilities: string[];
  executionSettings: { sandbox: string; timeoutSeconds: number };
  concurrencyLimit: number;
  status: string;
  assignedTaskId: string | null;
  sessionId: string | null;
  lastHeartbeat: string | null;
  usage: Record<string, unknown> | null;
  runHistory: string[];
}
export interface Project {
  id: string;
  name: string;
  goal: string;
  path: string;
  isGit: boolean;
  createdAt: string;
  /** source folders; ตัวที่ isPrimary ตรงกับ path */
  folders?: ProjectFolder[];
}
export interface ProjectFolder {
  id: string;
  path: string;
  repoRoot: string | null;
  isGit: boolean;
  isPrimary: boolean;
  position: number;
  exists: boolean;
}
export interface StorageInfo {
  dataDir: string;
  mode: "local" | "network";
  dbBytes: number;
  freeBytes: number;
  previous: string | null;
}
export interface StorageStatus {
  status: "ok" | "error";
  error: string | null;
  info: StorageInfo | null;
  /** ตำแหน่งก่อนหน้า (มีแม้ในโหมดกู้คืน) */
  previous: string | null;
}
export interface FolderInspection {
  path: string;
  repoRoot: string | null;
  isGit: boolean;
  warning: string | null;
}
export interface Execution {
  id: string;
  taskId: string;
  projectId: string;
  agentId: string;
  adapter: AdapterId;
  prompt: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  pid: number | null;
  sessionId: string | null;
}
export interface ExecutionEvent {
  id: number;
  executionId: string;
  kind: string;
  text: string;
  createdAt: string;
}
export interface Diagnostic {
  adapter: AdapterId;
  installed: boolean;
  version: string | null;
  authentication:
    | "authenticated"
    | "unauthenticated"
    | "unknown"
    | "not_required";
  executable: string | null;
  supported: boolean;
  message: string;
}
export interface Snapshot {
  tasks?: QueueTask[];
  workflows?: Workflow[];
  schedulerPaused?: boolean;
  agents: Agent[];
  projects: Project[];
  executions: Execution[];
  dataPath: string;
  remoteStatus:
    | "not_configured"
    | "connected"
    | "connecting"
    | "disconnected"
    | "pairing_required"
    | "offline";
}

export interface QueueTask {
  id: string;
  projectId: string;
  agentId: string;
  adapter: AdapterId;
  title: string;
  prompt: string;
  dependencies: string[];
  priority: number;
  timeoutSeconds: number;
  retryLimit: number;
  attempts: number;
  status: string;
  workflowId: string | null;
  step: string;
  gate: boolean;
  approved: boolean;
  createdAt: string;
  lastExecutionId: string | null;
  blocker: string | null;
}
export interface Workflow {
  id: string;
  projectId: string;
  objective: string;
  status: string;
  createdAt: string;
  reworkCount: number;
}
export interface TaskEvent {
  id: number;
  taskId: string;
  kind: string;
  text: string;
  createdAt: string;
  initiator: string;
  initiatorRef?: string | null;
}
