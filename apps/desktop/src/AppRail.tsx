import { useEffect, useRef, type MouseEvent } from "react";
import { AstraMark } from "../../../packages/ui/src/AstraMark";
import { Icon, type IconName } from "../../../packages/ui/src/icons";
import { pageHref, type DesktopPage } from "./pages";

type RailEntry = { page: DesktopPage; label: string; icon: IconName };

/** ลำดับตามงานของผู้ใช้: ดูทีม → สั่งงาน → ติดตาม → ตั้งค่า */
export const railEntries: RailEntry[] = [
  { page: "home", label: "Home", icon: "map" },
  { page: "chat", label: "แชทรวม", icon: "chat" },
  { page: "overview", label: "ภาพรวม", icon: "grid" },
  { page: "tasks", label: "คิวงาน", icon: "queue" },
  { page: "projects", label: "โปรเจกต์", icon: "folder" },
  { page: "monitor", label: "ผลการรัน", icon: "activity" },
  { page: "agents", label: "ทีม", icon: "users" },
  { page: "runtimes", label: "Runtime", icon: "plug" },
  { page: "storage", label: "พื้นที่จัดเก็บ", icon: "database" },
];

export function AppRail({
  page,
  native,
  theme,
  badges,
  onOpenPage,
  onToggleTheme,
}: {
  page: DesktopPage;
  native: boolean;
  theme: string;
  /** ตัวเลขบนไอคอน เช่น งานรออนุมัติ; 0 = ไม่แสดง */
  badges: Partial<Record<DesktopPage, { count: number; label: string }>>;
  onOpenPage: (page: DesktopPage, event?: MouseEvent<HTMLAnchorElement>) => void;
  onToggleTheme: () => void;
}) {
  const rail = useRef<HTMLElement>(null);
  // จอแคบ rail เป็นแถบล่างที่เลื่อนแนวนอนได้: เลื่อนหน้าปัจจุบันให้อยู่ในสายตา
  useEffect(() => {
    const nav = rail.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft =
      current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, [page]);
  const link = ({ page: target, label, icon }: RailEntry) => {
    const badge = badges[target];
    const name = badge?.count ? `${label} · ${badge.label} ${badge.count}` : label;
    return (
      <a
        key={target}
        className="rail-item"
        href={pageHref(target)}
        aria-label={name}
        data-label={label}
        aria-current={page === target ? "page" : undefined}
        onClick={(event) => onOpenPage(target, event)}
      >
        <Icon name={icon} />
        {!!badge?.count && (
          <span className="rail-badge" aria-hidden="true">
            {badge.count > 99 ? "99+" : badge.count}
          </span>
        )}
      </a>
    );
  };
  const nextTheme = theme === "dark" ? "ธีมสว่าง" : "ธีมมืด";
  return (
    <nav className="rail" aria-label="เมนูหลัก" ref={rail}>
      <a
        className="rail-logo"
        href={pageHref("home")}
        aria-label="Astra"
        onClick={(event) => onOpenPage("home", event)}
      >
        <AstraMark size={26} />
      </a>
      <div className="rail-group">{railEntries.map(link)}</div>
      <div className="rail-group end">
        {link({ page: "themes", label: "ธีมโลก", icon: "layers" })}
        {native && link({ page: "remote", label: "Remote", icon: "remote" })}
        {/* ai-design-check-ignore-next-line use-shared-components -- โปรเจกต์ยังไม่มี <Button> กลาง ปุ่มทั้งแอปใช้ <button> + class */}
        <button
          type="button"
          className="rail-item"
          onClick={onToggleTheme}
          aria-label="สลับ light/dark theme"
          data-label={nextTheme}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
      </div>
    </nav>
  );
}
