export const consolePages = [
  { id: "overview", label: "ภาพรวม" },
  { id: "tasks", label: "คิวงาน" },
  { id: "projects", label: "โปรเจกต์" },
  { id: "monitor", label: "ผลการรัน" },
  { id: "agents", label: "ทีม" },
  { id: "runtimes", label: "Runtime" },
  { id: "storage", label: "พื้นที่จัดเก็บ" },
  { id: "themes", label: "ธีมโลก" },
  { id: "remote", label: "Remote" },
] as const;

export type ConsolePage = (typeof consolePages)[number]["id"];
export type DesktopPage = "home" | "chat" | ConsolePage;

export function readPage(
  url: Pick<Location, "search" | "hash">,
  native: boolean,
): DesktopPage {
  const params = new URLSearchParams(url.search);
  const view = params.get("view");
  if (view === "chat") return "chat";
  if (view !== "console") return "home";

  const target = params.get("page") ?? url.hash.slice(1);
  const page = consolePages.find(({ id }) => id === target);
  return !page || (page.id === "remote" && !native) ? "overview" : page.id;
}

export function pageHref(page: DesktopPage) {
  if (page === "home") return "?";
  if (page === "chat") return "?view=chat";
  if (page === "overview") return "?view=console";
  return `?view=console&page=${page}`;
}
