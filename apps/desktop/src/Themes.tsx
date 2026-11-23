import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../../../packages/shared/src";
import type { SceneAgent } from "./home/OfficeScene";
import { worldById, worlds, type World, type WorldId } from "./home/worlds";
import "./themes.css";

type Previews = Partial<Record<WorldId, HTMLCanvasElement>>;

/** ภาพตัวอย่างจริงของแต่ละโลก วาดทีละภาพด้วยฉากเดียวกับหน้า Home */
function useWorldPreviews(theme: "dark" | "light", agents: SceneAgent[]) {
  const [previews, setPreviews] = useState<{ theme: string; urls: Previews }>({
    theme,
    urls: {},
  });
  const roster = agents.map((agent) => agent.id).join(",");
  useEffect(() => {
    let cancelled = false;
    let webgl: boolean;
    try {
      webgl = Boolean(document.createElement("canvas").getContext("webgl2"));
    } catch {
      webgl = false;
    }
    if (!webgl) return;
    void import("./home/OfficeScene").then(async ({ OfficeScene }) => {
      const urls: Previews = {};
      for (const world of worlds) {
        if (cancelled) return;
        try {
          // ใหญ่พอให้ภาพหลัก (hero) ไม่แตกเกินไป ขณะที่การ์ดย่อลง
          urls[world.id] = OfficeScene.preview(world.id, theme, agents, 840, 480);
        } catch {
          /* ใช้แถบสีแทนเมื่อวาดไม่สำเร็จ */
        }
        setPreviews({ theme, urls: { ...urls } });
        // เว้นเฟรมให้หน้าตอบสนองระหว่างวาด
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    });
    return () => {
      cancelled = true;
    };
    // วาดใหม่เมื่อธีมหรือรายชื่อ agent เปลี่ยนเท่านั้น
  }, [theme, roster]);
  return previews.theme === theme ? previews.urls : {};
}

/** วาดภาพตัวอย่างลง canvas (ไม่ใช้ data URL เพราะ CSP ของแอปไม่อนุญาต) */
function PreviewCanvas({ source }: { source: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    target.width = source.width;
    target.height = source.height;
    target.getContext("2d")?.drawImage(source, 0, 0);
  }, [source]);
  return <canvas ref={ref} className="world-image" aria-hidden="true" />;
}

function WorldImage({
  world,
  src,
}: {
  world: World;
  src?: HTMLCanvasElement;
}) {
  return src ? (
    <PreviewCanvas source={src} />
  ) : (
    <span
      className="world-image world-swatch"
      style={{
        background: `linear-gradient(135deg, ${world.wall[0]} 0 40%, ${world.floor.tones[0]} 40% 75%, ${world.rug[0]} 75%)`,
      }}
    />
  );
}

/** หน้า Themes: เลือกโลกของฉาก Home งานใน Core ไม่เปลี่ยน */
export function Themes({
  data,
  states,
  theme,
  world,
  onSelect,
}: {
  data: Snapshot;
  states: SceneAgent[];
  theme: "dark" | "light";
  world: WorldId;
  onSelect: (world: WorldId) => void;
}) {
  const previews = useWorldPreviews(theme, states);
  const active = worldById(world);
  return (
    <div className="themes span-12">
      <section className="theme-hero" aria-label="โลกที่ใช้อยู่">
        <WorldImage world={active} src={previews[active.id]} />
        <div className="theme-hero-text">
          <p>
            <span className="chip" data-tone="ok">
              ใช้อยู่
            </span>{" "}
            โลกของทีมตอนนี้
          </p>
          <h2>{active.name}</h2>
          <p className="theme-hero-meta">
            {data.agents.length} agents ที่โต๊ะ · {active.description}
          </p>
          <span className="avatar-row" aria-hidden="true">
            {data.agents.map((agent) => (
              <img
                key={agent.id}
                className="agent-avatar"
                data-agent={agent.characterKey}
                src={`/crewbots/${agent.characterKey}/portrait.svg`}
                alt=""
                width="32"
                height="32"
              />
            ))}
          </span>
        </div>
      </section>

      <section className="theme-section" aria-label="ธีมทั้งหมด">
        <h2>ธีมทั้งหมด</h2>
        <p className="hint">
          เปลี่ยนแค่หน้าตาของฉาก ผังโต๊ะ ลำดับงาน และงานใน Core เหมือนเดิม
        </p>
        <ul className="theme-grid">
          {worlds.map((item) => {
            const isActive = item.id === active.id;
            return (
              <li key={item.id} className="theme-card" data-active={isActive}>
                <div className="theme-card-image">
                  <WorldImage world={item} src={previews[item.id]} />
                  {isActive && (
                    <span className="theme-badge" data-tone="ok">
                      ใช้อยู่
                    </span>
                  )}
                </div>
                <div className="theme-card-body">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <button
                    type="button"
                    className={isActive ? "quiet" : undefined}
                    aria-pressed={isActive}
                    disabled={isActive}
                    onClick={() => onSelect(item.id)}
                  >
                    {isActive ? "ใช้อยู่" : `ใช้${item.name}`}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
