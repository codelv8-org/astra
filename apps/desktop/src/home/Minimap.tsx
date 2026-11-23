import { useEffect, useState, type MouseEvent, type RefObject } from "react";
import type { OfficeScene, SceneMap } from "./OfficeScene";
import { ROOM } from "./room";

const W = ROOM.maxX - ROOM.minX;
const D = ROOM.maxZ - ROOM.minZ;

/** แผนผังห้องมุมบน: จุดคือ agent กรอบคือส่วนที่กล้องเห็น คลิกเพื่อเลื่อนกล้อง */
export function Minimap({ scene }: { scene: RefObject<OfficeScene | null> }) {
  const [map, setMap] = useState<SceneMap | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = scene.current?.mapState();
      if (next) setMap(next);
    }, 300);
    return () => clearInterval(timer);
  }, [scene]);

  function onClick(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ROOM.minX + ((event.clientX - rect.left) / rect.width) * W;
    const z = ROOM.minZ + ((event.clientY - rect.top) / rect.height) * D;
    scene.current?.panTo(x, z);
  }

  if (!map) return null;
  return (
    <svg
      className="minimap"
      viewBox={`${ROOM.minX - 0.4} ${ROOM.minZ - 0.4} ${W + 0.8} ${D + 0.8}`}
      aria-hidden="true"
      onClick={onClick}
    >
      <rect
        className="minimap-room"
        x={ROOM.minX}
        y={ROOM.minZ}
        width={W}
        height={D}
        rx="0.3"
      />
      {map.bots.map((bot) => (
        <circle
          key={bot.id}
          className="minimap-bot"
          data-status={bot.status}
          cx={bot.x}
          cy={bot.z}
          r="0.45"
        />
      ))}
      <polygon
        className="minimap-view"
        points={map.view.map(([x, z]) => `${x},${z}`).join(" ")}
      />
    </svg>
  );
}
