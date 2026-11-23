import { useEffect, useState } from "react";
import type { Agent } from "../../../packages/shared/src";
import { bridge } from "./bridge";
import type { ExecutionResult, ExecutionResultRef } from "./executionResult";
import { agentName } from "./home/ceo";

export const runtimeLabels: Record<string, string> = {
  codex: "CODEX",
  claude: "CLAUDE CODE",
  antigravity: "ANTIGRAVITY",
  mock: "MOCK — no AI model",
};

export function ExecutionResultView({
  executionId,
  projectId,
  agents,
  status,
}: ExecutionResultRef & {
  agents: Agent[];
  status?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { executionId: string; projectId: string; result: ExecutionResult }
    | { executionId: string; projectId: string; error: string }
  >();
  useEffect(() => {
    let active = true;
    const target = { executionId, projectId };
    void bridge.executionResult(executionId, projectId).then(
      (result) => {
        if (active) setState({ ...target, result });
      },
      (error: unknown) => {
        if (active)
          setState({
            ...target,
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [executionId, projectId, status, attempt]);

  if (state?.executionId !== executionId || state.projectId !== projectId)
    return <p role="status">กำลังอ่านผลการรัน…</p>;
  if ("error" in state)
    return (
      <>
        <p className="error" role="alert">
          อ่านผลการรันไม่สำเร็จ · {state.error}
        </p>
        <button
          type="button"
          onClick={() => {
            setState(undefined);
            setAttempt((value) => value + 1);
          }}
        >
          ลองใหม่
        </button>
      </>
    );

  const { result } = state;
  const { event } = result;
  return (
    <section
      className="execution-result"
      aria-label="ผลที่ Desktop Core บันทึก"
    >
      <p className="hint">
        {agentName(agents, result.agentId)} ·{" "}
        {runtimeLabels[result.adapter] ?? result.adapter}
        {event && (
          <>
            {" · "}
            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleString("th-TH")}
            </time>
          </>
        )}
      </p>
      {event ? (
        <pre className="task-prompt" tabIndex={0} aria-label="ข้อความผลการรัน">
          {event.text}
        </pre>
      ) : (
        <p role="status">ยังไม่มีผลการรันที่ Desktop Core บันทึกไว้</p>
      )}
    </section>
  );
}
