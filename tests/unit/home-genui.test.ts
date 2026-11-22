import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import type { Snapshot } from "../../packages/shared/src";
import { GenUI } from "../../apps/desktop/src/home/genui/GenUI";
import {
  calculate,
  parseGenUI,
  validateGenUI,
  type GenBlock,
} from "../../apps/desktop/src/home/genui/spec";
import {
  progressGenUI,
  workflowGenUI,
} from "../../apps/desktop/src/home/genui/workflow";

const summary = { type: "summary", title: "สรุป", text: "ข้อมูลจริง" } as const;
const encode = (blocks: unknown[], prose = "ข้อความสำรอง") =>
  `${prose}\n\n\`\`\`genui\n${JSON.stringify({ version: 1, blocks })}\n\`\`\``;
const desktopRequire = createRequire(
  new URL("../../apps/desktop/package.json", import.meta.url),
);
const { createElement } = desktopRequire("react") as typeof import("react");
const { renderToStaticMarkup } = desktopRequire(
  "react-dom/server",
) as typeof import("react-dom/server");

describe("Home GenUI", () => {
  it("validates every supported block and chart variant", () => {
    const blocks: GenBlock[] = [
      summary,
      { type: "kpi", title: "KPI", items: [{ label: "งาน", value: 1 }] },
      {
        type: "table",
        title: "ตาราง",
        columns: ["ค่า"],
        rows: [[0], [null], [false]],
      },
      {
        type: "timeline",
        title: "Timeline",
        items: [{ label: "ASTRA", status: "active" }],
      },
      {
        type: "checklist",
        title: "Checklist",
        items: [{ label: "UAT", done: false }],
      },
      { type: "callout", title: "Callout", tone: "warning", text: "รออนุมัติ" },
      {
        type: "code",
        title: "Code",
        language: "html",
        text: "<script>alert(1)</script>",
      },
      {
        type: "calculator",
        title: "Calculator",
        operation: "divide",
        left: 10,
        right: 2,
      },
      {
        type: "followup",
        title: "ถามต่อ",
        items: [{ label: "รายละเอียด", prompt: "ขอรายละเอียด" }],
      },
      {
        type: "form",
        title: "ฟอร์ม",
        prompt: "คำขอ",
        fields: [{ label: "ช่วง", kind: "choice", options: ["วันนี้"] }],
      },
      {
        type: "tabs",
        title: "Tabs",
        items: [
          { label: "หนึ่ง", blocks: [summary] },
          { label: "สอง", blocks: [summary] },
        ],
      },
    ];
    for (const variant of ["bar", "line", "area", "pie", "donut"] as const) {
      blocks.push({
        type: "chart",
        title: "Chart",
        variant,
        points: [{ label: "A", value: 4 }],
      });
    }
    for (const block of blocks) {
      const parsed = parseGenUI(encode([block]));
      expect(parsed).toEqual({
        text: "ข้อความสำรอง",
        ui: { version: 1, blocks: [block] },
      });
      const html = renderToStaticMarkup(
        createElement(GenUI, {
          spec: parsed.ui!,
          onDraft: () => {
            throw new Error("ไม่ควรสร้างร่างระหว่าง render");
          },
        }),
      );
      expect(html).toContain(block.title);
      expect(html).not.toContain("<script>");
    }
  });

  it("keeps readable content when an artifact is incomplete or untrusted", () => {
    expect(parseGenUI("ข้อความเดิม")).toEqual({ text: "ข้อความเดิม" });
    expect(parseGenUI(encode([summary]).slice(0, -3))).toEqual({
      text: "ข้อความสำรอง",
    });
    expect(parseGenUI(encode([summary]) + "\nข้อความอีกส่วน")).toEqual({
      text: "ข้อความสำรอง\n\nข้อความอีกส่วน",
    });
    for (const block of [
      { type: "html", title: "HTML", html: "<iframe>" },
      { ...summary, onClick: "start" },
      { type: "table", title: "ตาราง", columns: ["ก", "ข"], rows: [[1]] },
      {
        type: "chart",
        title: "กราฟ",
        variant: "pie",
        points: [{ label: "ก", value: 0 }],
      },
      {
        type: "form",
        title: "ฟอร์ม",
        prompt: "ข้อความ",
        fields: [{ label: "ทางเลือก", kind: "choice" }],
      },
    ])
      expect(parseGenUI(encode([block]))).toEqual({ text: "ข้อความสำรอง" });
    expect(
      parseGenUI(encode([{ ...summary, text: "ก".repeat(25_000) }])),
    ).toEqual({ text: "ข้อความสำรอง" });
  });

  it("uses bounded arithmetic and handles division by zero", () => {
    expect(calculate("divide", 10, 0)).toBeNull();
    expect(calculate("percent", 15, 120)).toBe(18);
    expect(calculate("add", Infinity, 1)).toBeNull();
  });

  it("derives workflow visualizations only from the supplied snapshot", () => {
    const workflow = {
      id: "flow",
      projectId: "IT",
      objective: "ตรวจฐานข้อมูล",
      status: "active",
      createdAt: "",
      reworkCount: 0,
    };
    const data: Snapshot = {
      agents: [],
      projects: [],
      dataPath: "",
      executions: [],
      remoteStatus: "not_configured",
      tasks: [],
      workflows: [workflow],
    };
    expect(progressGenUI(data, "other")).toBeUndefined();
    expect(workflowGenUI(data, workflow)).toBeUndefined();
    data.tasks = [
      {
        id: "plan",
        projectId: "IT",
        agentId: "astra",
        adapter: "mock",
        title: "ASTRA",
        prompt: "",
        dependencies: [],
        priority: 1,
        timeoutSeconds: 30,
        retryLimit: 0,
        attempts: 0,
        status: "ready",
        workflowId: "flow",
        step: "plan",
        gate: false,
        approved: false,
        createdAt: "",
        lastExecutionId: null,
        blocker: null,
      },
    ];
    expect(
      validateGenUI(workflowGenUI(data, workflow))?.blocks[0],
    ).toMatchObject({
      type: "timeline",
      items: [{ status: "pending", detail: "รออนุมัติ" }],
    });
    expect(validateGenUI(progressGenUI(data, "IT"))?.blocks[1]).toMatchObject({
      type: "chart",
      points: expect.arrayContaining([{ label: "รออนุมัติ", value: 1 }]),
    });
  });
});
