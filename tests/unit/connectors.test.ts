import { describe, it, expect } from "vitest";
import type { Diagnostic } from "../../packages/shared/src";
import agents from "../../packages/shared/default-agents.json";
import { connectorCatalog, connectorStatus } from "../../apps/desktop/src/runtimeCatalog";

const diag = (patch: Partial<Diagnostic>): Diagnostic => ({
  adapter: "codex",
  installed: true,
  version: "0.159.2",
  authentication: "authenticated",
  executable: "codex",
  supported: true,
  message: "",
  ...patch,
});

describe("connectors", () => {
  it("covers every runtime the roster uses", () => {
    const adapters = connectorCatalog.map((item) => item.adapter);
    for (const agent of agents) expect(adapters).toContain(agent.runtimeAdapter);
    expect(adapters).toContain("mock");
  });
  it("derives status only from the latest diagnostic", () => {
    expect(connectorStatus(undefined)).toEqual({ tone: "idle", label: "ยังไม่ได้ตรวจ" });
    expect(connectorStatus(diag({ installed: false })).tone).toBe("bad");
    expect(connectorStatus(diag({ supported: false })).label).toBe("รุ่นที่ไม่รองรับ");
    expect(connectorStatus(diag({ authentication: "unauthenticated" })).tone).toBe("wait");
    expect(connectorStatus(diag({ authentication: "unknown" })).tone).toBe("wait");
    expect(connectorStatus(diag({})).tone).toBe("ok");
    expect(connectorStatus(diag({ authentication: "not_required" })).label).toBe("พร้อมใช้");
  });
});
