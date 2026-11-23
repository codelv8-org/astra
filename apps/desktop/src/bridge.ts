import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WritingInfo } from "./WritingPanel";
import type { ExecutionResult } from "./executionResult";
import type { Overview } from "./projectFlow";
import type {
  QueueTask,
  Workflow,
  TaskEvent,
  Diagnostic,
  Execution,
  ExecutionEvent,
  Snapshot,
  FolderInspection,
  Project,
  StorageStatus,
} from "../../../packages/shared/src";
export const desktopAvailable = () => isTauri();
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!desktopAvailable())
    return Promise.reject(
      new Error(
        "เปิด Astra Desktop เพื่อใช้ local execution; browser preview ไม่มี Desktop Core",
      ),
    );
  return invoke<T>(command, args);
}
export const bridge = {
  remoteStatus: () =>
    call<{
      connection: string;
      deviceId: string | null;
      server: string | null;
      shared: { projectId: string; logs: boolean }[];
    }>("remote_status", {}),
  remotePair: (server: string, code: string, name: string, customCa: boolean) =>
    call<void>("remote_pair", { server, code, name, customCa }),
  remoteConnect: () => call<void>("remote_connect", {}),
  remoteDisconnect: () => call<void>("remote_disconnect", {}),
  remoteForget: () => call<void>("remote_forget", {}),
  remoteShare: (projectId: string, enabled: boolean, logs: boolean) =>
    call<void>("remote_share", { projectId, enabled, logs }),
  writingInfo: (taskId: string) =>
    call<WritingInfo>("writing_info", { taskId }),
  configureWriting: (taskId: string, paths: string[]) =>
    call<void>("configure_writing", { taskId, paths }),
  writingAction: (taskId: string, action: string, digest: string) =>
    call<void>("writing_action", { taskId, action, digest }),
  createTask: (
    input: Omit<
      QueueTask,
      | "id"
      | "attempts"
      | "status"
      | "workflowId"
      | "step"
      | "gate"
      | "approved"
      | "createdAt"
      | "lastExecutionId"
      | "blocker"
    >,
  ) => call<QueueTask>("create_task", { input }),
  createWorkflow: (projectId: string, objective: string, mock: boolean) =>
    call<Workflow>("create_workflow", { projectId, objective, mock }),
  createWritingWorkflow: (
    projectId: string,
    objective: string,
    mock: boolean,
  ) =>
    call<Workflow>("create_writing_workflow", { projectId, objective, mock }),
  queueAction: (taskId: string, action: string, note?: string) =>
    call<void>("queue_action", { taskId, action, note }),
  queueEvents: (taskId: string) =>
    call<TaskEvent[]>("queue_events", { taskId }),
  scheduling: (paused: boolean) => call<void>("scheduling", { paused }),
  snapshot: () => call<Snapshot>("snapshot"),
  diagnostics: () => call<Diagnostic[]>("diagnostics"),
  storageInfo: () => call<StorageStatus>("storage_info"),
  pickStorageFolder: () => call<string | null>("pick_storage_folder"),
  changeStorageFolder: (path: string, useExisting: boolean) =>
    call<void>("change_storage_folder", { path, useExisting }),
  revertStorage: () => call<void>("revert_storage"),
  deletePreviousStorage: () => call<void>("delete_previous_storage"),
  restartApp: () => call<void>("restart_app"),
  pickFolder: () => call<string | null>("pick_folder"),
  inspectFolder: (path: string, projectId: string | null) =>
    call<FolderInspection>("inspect_folder", { path, projectId }),
  createProject: (
    name: string,
    goal: string,
    folders: string[],
    primary: number,
  ) => call<Project>("create_project", { name, goal, folders, primary }),
  addProjectFolder: (projectId: string, path: string) =>
    call<Project>("add_project_folder", { projectId, path }),
  removeProjectFolder: (projectId: string, folderId: string) =>
    call<Project>("remove_project_folder", { projectId, folderId }),
  setPrimaryFolder: (projectId: string, folderId: string) =>
    call<Project>("set_primary_folder", { projectId, folderId }),
  start: (request: {
    projectId: string;
    agentId: string;
    adapter: string;
    prompt: string;
    approved: boolean;
  }) => call<Execution>("start_run", { request }),
  events: (executionId: string, after: number) =>
    call<ExecutionEvent[]>("execution_events", { executionId, after }),
  executionResult: (executionId: string, projectId: string) =>
    call<ExecutionResult>("execution_result", { executionId, projectId }),
  cancel: (executionId: string) => call<void>("cancel_run", { executionId }),
  projectOverview: (days: number) =>
    call<Overview>("project_overview", { days }),
  linkSession: (agent: string, sessionId: string, projectId: string | null) =>
    call<void>("link_session", { agent, sessionId, projectId }),
};
