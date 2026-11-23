import { describe, expect, it } from "vitest";
import { initiatorLabel } from "../../apps/desktop/src/initiator";

describe("initiatorLabel", () => {
  it("names who caused each task event", () => {
    expect(initiatorLabel({ initiator: "owner" })).toBe("คุณ");
    expect(initiatorLabel({ initiator: "remote", initiatorRef: "dev-1234abcd" })).toBe(
      "Remote (อุปกรณ์ dev-1234)",
    );
    expect(initiatorLabel({ initiator: "scheduler" })).toBe("ตัวจัดคิว");
    expect(initiatorLabel({ initiator: "handoff", initiatorRef: "abcdef123456" })).toBe(
      "ส่งต่อจากงาน abcdef12",
    );
    expect(initiatorLabel({ initiator: "system" })).toBe("ระบบ");
  });
  it("treats legacy and unexpected values as unknown", () => {
    expect(initiatorLabel({ initiator: "unknown" })).toBe("ไม่ทราบ (ก่อนอัปเดต)");
    expect(initiatorLabel({ initiator: "something-new" })).toBe("ไม่ทราบ (ก่อนอัปเดต)");
  });
});
