import { z } from "zod";

const title = z.string().trim().min(1).max(120);
const detail = z.string().trim().min(1).max(1200);
const number = z.number().min(-1e12).max(1e12);
const scalar = z.union([z.string().max(500), number, z.boolean(), z.null()]);
const point = z.strictObject({ label: title, value: number });
const leaf = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("summary"), title, text: detail }),
  z.strictObject({
    type: z.literal("kpi"),
    title,
    items: z
      .array(
        z.strictObject({
          label: title,
          value: z.union([title, number]),
          detail: title.optional(),
        }),
      )
      .min(1)
      .max(8),
  }),
  z.strictObject({
    type: z.literal("table"),
    title,
    columns: z.array(title).min(1).max(12),
    rows: z.array(z.array(scalar).max(12)).max(100),
  }),
  z.strictObject({
    type: z.literal("chart"),
    title,
    variant: z.enum(["bar", "line", "area", "pie", "donut"]),
    points: z.array(point).min(1).max(20),
    unit: title.optional(),
  }),
  z.strictObject({
    type: z.literal("timeline"),
    title,
    items: z
      .array(
        z.strictObject({
          label: title,
          status: z.enum(["pending", "active", "done", "failed"]),
          detail: detail.optional(),
        }),
      )
      .min(1)
      .max(24),
  }),
  z.strictObject({
    type: z.literal("checklist"),
    title,
    items: z
      .array(
        z.strictObject({
          label: title,
          done: z.boolean(),
        }),
      )
      .min(1)
      .max(24),
  }),
  z.strictObject({
    type: z.literal("callout"),
    title,
    tone: z.enum(["info", "success", "warning", "error"]),
    text: detail,
  }),
  z.strictObject({
    type: z.literal("code"),
    title,
    language: title.optional(),
    text: z.string().min(1).max(5000),
  }),
  z.strictObject({
    type: z.literal("calculator"),
    title,
    operation: z.enum(["add", "subtract", "multiply", "divide", "percent"]),
    left: number,
    right: number,
  }),
  z.strictObject({
    type: z.literal("followup"),
    title,
    items: z
      .array(
        z.strictObject({
          label: title,
          prompt: detail,
        }),
      )
      .min(1)
      .max(6),
  }),
  z.strictObject({
    type: z.literal("form"),
    title,
    prompt: detail,
    fields: z
      .array(
        z.strictObject({
          label: title,
          kind: z.enum(["text", "number", "choice"]),
          options: z.array(title).min(1).max(10).optional(),
          required: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(6),
  }),
]);
const block = z.union([
  leaf,
  z.strictObject({
    type: z.literal("tabs"),
    title,
    items: z
      .array(
        z.strictObject({
          label: title,
          blocks: z.array(leaf).min(1).max(4),
        }),
      )
      .min(2)
      .max(5),
  }),
]);
const spec = z.strictObject({
  version: z.literal(1),
  blocks: z.array(block).min(1).max(8),
});
export type GenBlock = z.infer<typeof block>;
export type GenSpec = z.infer<typeof spec>;
export function validateGenUI(value: unknown): GenSpec | undefined {
  const parsed = spec.safeParse(value);
  if (!parsed.success) return;
  const leaves = parsed.data.blocks.flatMap((item) =>
    item.type === "tabs" ? item.items.flatMap((tab) => tab.blocks) : [item],
  );
  if (leaves.length > 20) return;
  for (const item of leaves) {
    if (
      item.type === "table" &&
      item.rows.some((row) => row.length !== item.columns.length)
    )
      return;
    if (
      item.type === "chart" &&
      ["pie", "donut"].includes(item.variant) &&
      (item.points.length > 8 ||
        item.points.some(({ value }) => value < 0) ||
        !item.points.some(({ value }) => value > 0))
    )
      return;
    if (
      item.type === "form" &&
      item.fields.some((field) =>
        field.kind === "choice"
          ? !field.options ||
            new Set(field.options).size !== field.options.length
          : field.options !== undefined,
      )
    )
      return;
  }
  return parsed.data;
}

const maxPayloadBytes = 24_000;

/** แยกบล็อก JSON ท้ายผล agent เมื่อปิด fence ครบและข้อมูลผ่าน schema */
export function parseGenUI(answer: string): { text: string; ui?: GenSpec } {
  const marker = /(?:^|\r?\n)```genui[ \t]*\r?\n/i.exec(answer);
  if (!marker) return { text: answer };
  const prose = answer.slice(0, marker.index).trimEnd();
  const start = marker.index + marker[0].length;
  const tail = answer.slice(start);
  const ending = /(?:^|\r?\n)```[ \t]*(?=\r?\n|$)/.exec(tail);
  const suffix = ending
    ? tail.slice(ending.index + ending[0].length).trim()
    : "";
  const fallback = {
    text:
      [prose, suffix].filter(Boolean).join("\n\n") ||
      "รูปแบบผลลัพธ์จาก agent เปิดอ่านได้ในประวัติการรัน",
  };
  if (!ending || suffix) return fallback;
  const payload = tail.slice(0, ending.index);
  if (
    payload.length > maxPayloadBytes ||
    new TextEncoder().encode(payload).length > maxPayloadBytes
  )
    return fallback;
  try {
    const ui = validateGenUI(JSON.parse(payload));
    return ui ? { text: prose, ui } : fallback;
  } catch {
    return fallback;
  }
}

export function calculate(
  operation: Extract<GenBlock, { type: "calculator" }>["operation"],
  left: number,
  right: number,
) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const result = {
    add: () => left + right,
    subtract: () => left - right,
    multiply: () => left * right,
    divide: () => left / right,
    percent: () => (left * right) / 100,
  }[operation]();
  return Number.isFinite(result) ? result : null;
}
