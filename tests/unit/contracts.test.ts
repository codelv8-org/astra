import { describe, it, expect } from "vitest";
import { projectInput, runInput, taskStates } from "../../packages/shared/src";
import { remoteCommand } from "../../packages/protocol/src";
import agents from "../../packages/shared/default-agents.json";
describe("Phase 1 contracts", () => {
  it("rejects missing approval and invalid project IDs", () => {
    expect(
      runInput.safeParse({
        projectId: "invalid",
        agentId: "astra",
        adapter: "codex",
        prompt: "hello",
        approved: false,
      }).success,
    ).toBe(false);
    expect(
      runInput.safeParse({
        projectId: crypto.randomUUID(),
        agentId: "astra",
        adapter: "codex",
        prompt: "hello",
        approved: true,
      }).success,
    ).toBe(true);
  });
  it("trims project names and bounds inputs", () => {
    expect(projectInput.parse({ name: " CrewNest ", goal: "" }).name).toBe(
      "CrewNest",
    );
    expect(projectInput.safeParse({ name: " ", goal: "" }).success).toBe(false);
    expect(
      projectInput.safeParse({ name: "Test", goal: "x".repeat(4001) }).success,
    ).toBe(false);
  });
  it("preserves the roster and explicit task state model", () => {
    expect(agents.map((a) => [a.name, a.runtimeAdapter])).toEqual([
      ["ASTRA", "codex"],
      ["FORGE", "claude"],
      ["MIRA", "antigravity"],
      ["VECTOR", "codex"],
      ["SCOUT", "codex"],
    ]);
    expect(new Set(agents.map((a) => a.id)).size).toBe(5);
    expect(taskStates).toEqual([
      "draft",
      "ready",
      "queued",
      "running",
      "blocked",
      "needs_review",
      "completed",
      "failed",
      "canceled",
    ]);
  });
  it("rejects arbitrary remote actions, extra payloads and inverted expiry", () => {
    const command = {
      command_id: crypto.randomUUID(),
      device_id: crypto.randomUUID(),
      project_id: crypto.randomUUID(),
      task_id: crypto.randomUUID(),
      action: "start",
      requested_by: crypto.randomUUID(),
      issued_at: "2026-11-17T01:00:00Z",
      expires_at: "2026-11-17T01:01:00Z",
      idempotency_key: "one",
      authorization_context: { approval_id: null },
    };
    expect(remoteCommand.safeParse(command).success).toBe(true);
    expect(
      remoteCommand.safeParse({ ...command, action: "shell" }).success,
    ).toBe(false);
    expect(
      remoteCommand.safeParse({ ...command, shell: "whoami" }).success,
    ).toBe(false);
    expect(
      remoteCommand.safeParse({ ...command, expires_at: command.issued_at })
        .success,
    ).toBe(false);
  });
});
