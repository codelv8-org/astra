import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { GenChart } from "./GenChart";
import { GenTable } from "./GenTable";
import { calculate, type GenBlock, type GenSpec } from "./spec";
import "./genui.css";

type DraftAction = (text: string) => void;
const timelineLabels = {
  pending: "รอ",
  active: "กำลังทำ",
  done: "เสร็จ",
  failed: "ติดขัด",
};
const calloutLabels = {
  info: "ข้อมูล",
  success: "สำเร็จ",
  warning: "ควรตรวจสอบ",
  error: "ข้อผิดพลาด",
};
const operations = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
  percent: "% ของ",
};
const formatNumber = new Intl.NumberFormat("th-TH", {
  maximumSignificantDigits: 12,
});

function Calculator({
  item,
}: {
  item: Extract<GenBlock, { type: "calculator" }>;
}) {
  const [left, setLeft] = useState(String(item.left));
  const [right, setRight] = useState(String(item.right));
  const value =
    left === "" || right === ""
      ? null
      : calculate(item.operation, Number(left), Number(right));
  return (
    <>
      <div className="genui-calculator">
        <label>
          ค่าแรก
          <input
            type="number"
            step="any"
            value={left}
            onChange={(e) => setLeft(e.target.value)}
          />
        </label>
        <span aria-label={operations[item.operation]}>
          {operations[item.operation]}
        </span>
        <label>
          ค่าที่สอง
          <input
            type="number"
            step="any"
            value={right}
            onChange={(e) => setRight(e.target.value)}
          />
        </label>
      </div>
      <output aria-live="polite">
        {value === null ? "กรอกค่าที่คำนวณได้" : formatNumber.format(value)}
      </output>
    </>
  );
}

function DraftForm({
  item,
  onDraft,
}: {
  item: Extract<GenBlock, { type: "form" }>;
  onDraft: DraftAction;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = item.fields.flatMap((field, index) => {
      const value = String(form.get(String(index)) ?? "").trim();
      return value ? [`${field.label}: ${value}`] : [];
    });
    onDraft([item.prompt, ...fields].join("\n"));
  }
  return (
    <form onSubmit={submit}>
      {item.fields.map((field, index) => (
        <label key={index}>
          {field.label}
          {field.required && " *"}
          {field.kind === "choice" ? (
            <select
              name={String(index)}
              required={field.required}
              defaultValue=""
            >
              <option value="">เลือกตัวเลือก</option>
              {field.options?.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          ) : (
            <input
              name={String(index)}
              type={field.kind}
              required={field.required}
              step={field.kind === "number" ? "any" : undefined}
              maxLength={500}
            />
          )}
        </label>
      ))}
      <button type="submit">นำข้อมูลไปใส่ร่างข้อความ</button>
    </form>
  );
}

function Tabs({
  item,
  onDraft,
}: {
  item: Extract<GenBlock, { type: "tabs" }>;
  onDraft: DraftAction;
}) {
  const id = useId();
  const [active, setActive] = useState(0);
  function move(event: KeyboardEvent<HTMLDivElement>) {
    const count = item.items.length;
    const destinations: Record<string, number> = {
      ArrowLeft: (active - 1 + count) % count,
      ArrowRight: (active + 1) % count,
      Home: 0,
      End: count - 1,
    };
    const dest = destinations[event.key];
    if (dest === undefined) return;
    event.preventDefault();
    setActive(dest);
    event.currentTarget.querySelectorAll("button")[dest]?.focus();
  }
  return (
    <>
      <div
        role="tablist"
        aria-label={item.title}
        className="genui-controls"
        onKeyDown={move}
      >
        {item.items.map(({ label }, index) => (
          <button
            key={index}
            type="button"
            id={`${id}-tab-${index}`}
            role="tab"
            tabIndex={active === index ? 0 : -1}
            aria-selected={active === index}
            aria-controls={`${id}-panel-${index}`}
            onClick={() => setActive(index)}
          >
            {label}
          </button>
        ))}
      </div>
      {item.items.map(({ blocks }, index) => (
        <div
          key={index}
          hidden={active !== index}
          tabIndex={0}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
        >
          {blocks.map((block, index) => (
            <Block key={index} item={block} onDraft={onDraft} />
          ))}
        </div>
      ))}
    </>
  );
}

function Body({ item, onDraft }: { item: GenBlock; onDraft: DraftAction }) {
  switch (item.type) {
    case "summary":
      return <p>{item.text}</p>;
    case "callout":
      return (
        <p>
          <strong>{calloutLabels[item.tone]}</strong> · {item.text}
        </p>
      );
    case "kpi":
      return (
        <dl className="genui-kpis">
          {item.items.map(({ label, value, detail }, index) => (
            <div key={index}>
              <dt>{label}</dt>
              <dd>
                {value}
                {detail && <small>{detail}</small>}
              </dd>
            </div>
          ))}
        </dl>
      );
    case "timeline":
      return (
        <ol className="genui-timeline">
          {item.items.map(({ label, status, detail }, index) => (
            <li key={index} data-status={status}>
              <strong>{label}</strong>
              <span>
                {timelineLabels[status]}
                {detail && ` · ${detail}`}
              </span>
            </li>
          ))}
        </ol>
      );
    case "checklist":
      return (
        <ul className="genui-checklist">
          {item.items.map(({ label, done }, index) => (
            <li key={index}>
              <label>
                <input type="checkbox" checked={done} disabled />
                {label}
              </label>
            </li>
          ))}
        </ul>
      );
    case "code":
      return (
        <details>
          <summary>ดูโค้ด{item.language ? ` · ${item.language}` : ""}</summary>
          <pre tabIndex={0}>
            <code>{item.text}</code>
          </pre>
        </details>
      );
    case "followup":
      return (
        <div className="genui-controls">
          {item.items.map(({ label, prompt }, index) => (
            <button key={index} type="button" onClick={() => onDraft(prompt)}>
              ร่าง: {label}
            </button>
          ))}
        </div>
      );
    case "form":
      return <DraftForm item={item} onDraft={onDraft} />;
    case "calculator":
      return <Calculator item={item} />;
    case "table":
      return <GenTable item={item} />;
    case "chart":
      return <GenChart item={item} />;
    case "tabs":
      return <Tabs item={item} onDraft={onDraft} />;
  }
}

function Block({ item, onDraft }: { item: GenBlock; onDraft: DraftAction }) {
  return (
    <section
      className="genui-block"
      data-tone={item.type === "callout" ? item.tone : undefined}
    >
      <h3>{item.title}</h3>
      <Body item={item} onDraft={onDraft} />
    </section>
  );
}

export function GenUI({
  spec,
  onDraft,
}: {
  spec: GenSpec;
  onDraft: DraftAction;
}) {
  return (
    <div className="genui">
      {spec.blocks.map((item, index) => (
        <Block key={index} item={item} onDraft={onDraft} />
      ))}
    </div>
  );
}
