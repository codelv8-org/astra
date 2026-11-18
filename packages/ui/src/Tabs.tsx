/* Lucian UX/UI Prompt #039 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#039 */
import { useEffect, useId, useRef } from "react";
import "./lucian-039.css";

export interface ActivityItem {
  title: string;
  subtitle: string;
  detail: string;
  color: string;
}
export function ActivityTabs({
  groups,
}: {
  groups: { label: string; items: ActivityItem[] }[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const selected = useRef(0);
  const id = useId();
  useEffect(() => {
    const element = root.current!;
    const tabs = [...element.querySelectorAll<HTMLButtonElement>(".u039-tab")];
    const pill = element.querySelector<HTMLElement>(".u039-pill")!;
    const panel = element.querySelector<HTMLElement>(".u039-panel")!;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cleanups: (() => void)[] = [];
    let list: HTMLUListElement | null = null;
    function movePill(animate: boolean) {
      const tab = tabs[selected.current];
      if (!animate) pill.style.transition = "none";
      pill.style.setProperty("--x", `${tab.offsetLeft}px`);
      pill.style.setProperty("--w", `${tab.offsetWidth}px`);
      if (!animate) {
        void pill.offsetWidth;
        pill.style.transition = "";
      }
    }
    function make(index: number) {
      const ul = document.createElement("ul");
      ul.className = "u039-list";
      const items = groups[index].items.length
        ? groups[index].items
        : [
            {
              title: "ยังไม่มี execution",
              subtitle: "ผลลัพธ์จะแสดงจาก Desktop Core",
              detail: "—",
              color: "var(--ux-surface-3)",
            },
          ];
      items.slice(0, 4).forEach((item, row) => {
        const li = document.createElement("li");
        li.className = "u039-row";
        li.style.transitionDelay = `${row * 45}ms`;
        const art = document.createElement("span");
        art.className = "u039-art";
        art.style.setProperty("--g", item.color);
        art.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        const title = document.createElement("b");
        title.textContent = item.title;
        const subtitle = document.createElement("small");
        subtitle.textContent = item.subtitle;
        text.append(title, subtitle);
        const detail = document.createElement("em");
        detail.textContent = item.detail;
        li.append(art, text, detail);
        ul.append(li);
      });
      return ul;
    }
    function select(index: number, focus = false, initial = false) {
      if (index === selected.current && list) return;
      const direction = index > selected.current ? 1 : -1;
      selected.current = index;
      tabs.forEach((tab, position) => {
        tab.setAttribute("aria-selected", String(position === index));
        tab.tabIndex = position === index ? 0 : -1;
      });
      if (focus) tabs[index].focus();
      movePill(!initial);
      const next = make(index),
        old = list;
      list = next;
      if (!old || reducedMotion.matches) {
        old?.remove();
        panel.append(next);
        return;
      }
      [...next.children].forEach((row) => {
        const item = row as HTMLElement;
        item.style.transform = `translateX(${direction * 70}%)`;
        item.style.opacity = "0";
      });
      panel.append(next);
      void next.offsetWidth;
      [...next.children].forEach((row) => {
        const item = row as HTMLElement;
        item.style.transform = "";
        item.style.opacity = "";
      });
      [...old.children].forEach((row) => {
        const item = row as HTMLElement;
        item.style.transform = `translateX(${-direction * 60}%)`;
        item.style.opacity = "0";
      });
      timers.push(setTimeout(() => old.remove(), 700));
    }
    tabs.forEach((tab, index) => {
      const click = () => select(index);
      const keydown = (event: KeyboardEvent) => {
        const delta =
          event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (delta) {
          event.preventDefault();
          select((index + delta + tabs.length) % tabs.length, true);
        }
      };
      tab.addEventListener("click", click);
      tab.addEventListener("keydown", keydown);
      cleanups.push(() => {
        tab.removeEventListener("click", click);
        tab.removeEventListener("keydown", keydown);
      });
    });
    select(selected.current, false, true);
    const observer = new ResizeObserver(() => movePill(false));
    observer.observe(element);
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      timers.forEach(clearTimeout);
      observer.disconnect();
      panel.replaceChildren();
    };
  }, [groups]);
  return (
    <div className="ux u039" ref={root}>
      <div className="u039-tabs" role="tablist" aria-label="Execution activity">
        <span className="u039-pill" aria-hidden="true" />
        {groups.map((group, index) => (
          <button
            className="u039-tab"
            type="button"
            role="tab"
            id={`${id}-${index}`}
            aria-controls={`${id}-panel`}
            aria-selected={selected.current === index}
            key={group.label}
          >
            {group.label}
          </button>
        ))}
      </div>
      <div
        className="u039-panel"
        id={`${id}-panel`}
        role="tabpanel"
        aria-label="Execution records"
      />
    </div>
  );
}
