import type { ExecutionEvent } from "../../../packages/shared/src";

export interface ExecutionResultRef {
  executionId: string;
  projectId: string;
}

export interface ExecutionResult extends ExecutionResultRef {
  agentId: string;
  adapter: string;
  event: ExecutionEvent | null;
}

export function chatExecutionRef(message: {
  id: string;
  from: string;
  projectId?: string;
}): ExecutionResultRef | null {
  const match = /^execution:([a-f\d-]+)$/i.exec(message.id);
  if (message.from === "owner" || !match || !message.projectId) return null;
  return { executionId: match[1], projectId: message.projectId };
}

/** อ่าน artifact ล่าสุดตามลำดับเดียวกับที่ Core ใช้สร้าง handoff */
export async function readExecutionResult(
  readPage: (after: number) => Promise<ExecutionEvent[]>,
) {
  let after = 0;
  let artifact: ExecutionEvent | undefined;
  let result: ExecutionEvent | undefined;
  for (;;) {
    const events = await readPage(after);
    for (const event of events) {
      if (event.kind === "artifact") artifact = event;
      if (event.kind === "result") result = event;
    }
    // Core จำกัด 500 events ต่อหน้า
    if (events.length < 500) return artifact ?? result;
    after = events[events.length - 1].id;
  }
}
