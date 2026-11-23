import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../apps/desktop/src/App";
import { consolePages, pageHref, readPage } from "../../apps/desktop/src/pages";

const url = (href: string) => new URL(href, "http://localhost/");
const desktopRequire = createRequire(
  new URL("../../apps/desktop/package.json", import.meta.url),
);
const { createElement } = desktopRequire("react") as typeof import("react");
const { renderToStaticMarkup } = desktopRequire(
  "react-dom/server",
) as typeof import("react-dom/server");

afterEach(() => vi.unstubAllGlobals());

describe("Astra Desktop navigation", () => {
  it.each(["home", "chat", ...consolePages.map(({ id }) => id)] as const)(
    "resolves the direct link for %s",
    (page) => {
      expect(readPage(url(pageHref(page)), true)).toBe(page);
    },
  );

  it("resolves old Console links and prefers the page parameter", () => {
    expect(readPage(url("?view=console#tasks"), true)).toBe("tasks");
    expect(readPage(url("?view=console&page=monitor#tasks"), true)).toBe(
      "monitor",
    );
  });

  it("uses the Console overview for unknown or unavailable pages", () => {
    expect(readPage(url("?view=console&page=missing"), true)).toBe("overview");
    expect(readPage(url(pageHref("remote")), false)).toBe("overview");
  });

  it.each([
    ["overview", "Pulse"],
    ["tasks", "Task queue &amp; workflows"],
    ["projects", "Projects"],
    ["monitor", "Execution monitor"],
    ["agents", "ลำดับการส่งต่องาน"],
    ["runtimes", "เชื่อม agent ที่คุณรันอยู่แล้ว"],
    ["themes", "ออฟฟิศ"],
    ["remote", "Secure remote control"],
    ["chat", "ห้องแชทรวม"],
  ] as const)(
    "renders the %s page without the other sections",
    (page, heading) => {
      vi.stubGlobal("location", url(pageHref(page)));
      vi.stubGlobal("localStorage", { getItem: () => null });
      vi.stubGlobal("window", {});
      vi.stubGlobal("isTauri", true);

      const html = renderToStaticMarkup(createElement(App));
      const sectionHeadings = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map(
        (match) => match[1],
      );
      const more: Partial<Record<string, string[]>> = {
        overview: ["Activity", "รอคุณตัดสิน"],
        agents: ["5 โต๊ะงาน · 5 agents"],
        runtimes: ["Runtime ในเครื่อง"],
        themes: ["ธีมทั้งหมด"],
      };
      expect(sectionHeadings).toEqual([heading, ...(more[page] ?? [])]);
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    },
  );
});
