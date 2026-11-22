/* ภาพเส้น isometric ของโต๊ะงาน (เรขาคณิตต้นฉบับ วาดด้วย SVG ไม่มีภาพภายนอก)
   ใช้สี --iso-* จากธีม เพื่อให้เข้ากับ light/dark */

export type IsoVariant = "hub" | "double" | "single" | "you";

type Pt = [number, number];
const S = 10;
const iso = (x: number, y: number, z: number): Pt => [
  (x - y) * 0.866 * S,
  (x + y) * 0.5 * S - z * S,
];
const poly = (points: Pt[]) =>
  // ai-design-check-ignore-next-line locale-number-format -- พิกัด SVG ไม่ใช่ตัวเลขที่ผู้ใช้อ่าน ต้องใช้จุดทศนิยมเสมอ
  points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  accent?: boolean;
}

function faces({ x, y, z, w, d, h }: Box) {
  const top = z + h;
  return {
    top: [iso(x, y, top), iso(x + w, y, top), iso(x + w, y + d, top), iso(x, y + d, top)],
    left: [iso(x, y + d, top), iso(x + w, y + d, top), iso(x + w, y + d, z), iso(x, y + d, z)],
    right: [iso(x + w, y, top), iso(x + w, y + d, top), iso(x + w, y + d, z), iso(x + w, y, z)],
  };
}

const layouts: Record<IsoVariant, Box[]> = {
  hub: [
    { x: 0, y: 0, z: 0, w: 8, d: 8, h: 1 },
    { x: 2.6, y: 2.6, z: 1, w: 2.8, d: 2.8, h: 1.2, accent: true },
  ],
  double: [
    { x: 0, y: 0, z: 0, w: 8, d: 8, h: 1 },
    { x: 1, y: 1.4, z: 1, w: 2.6, d: 2.6, h: 1.5 },
    { x: 4.4, y: 3.8, z: 1, w: 2.6, d: 2.6, h: 1.5 },
  ],
  single: [
    { x: 0, y: 0, z: 0, w: 8, d: 8, h: 1 },
    { x: 2.6, y: 2.6, z: 1, w: 2.8, d: 2.8, h: 1.7 },
  ],
  you: [
    { x: 0, y: 0, z: 0, w: 8, d: 8, h: 1 },
    { x: 1.6, y: 1.6, z: 1, w: 4.8, d: 4.8, h: 0.2, accent: true },
  ],
};

/** จุดบนผิวบนของกล่อง (สำหรับลายลูกเต๋าและไฟ) */
const onTop = (box: Box, u: number, v: number) =>
  iso(box.x + box.w * u, box.y + box.d * v, box.z + box.h);

export function IsoArt({ variant }: { variant: IsoVariant }) {
  const boxes = layouts[variant];
  const slab = boxes[0];
  const shapes = boxes.map(faces);
  const all = shapes.flatMap((shape) => [...shape.top, ...shape.left, ...shape.right]);
  // ai-design-check-ignore-next-line no-placeholder-data -- [x] คือการแยกพิกัดจาก tuple ไม่ใช่ข้อมูลตัวอย่าง
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const pad = 8;
  const viewBox = [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) - Math.min(...xs) + pad * 2,
    Math.max(...ys) - Math.min(...ys) + pad * 2,
  ].join(" ");

  return (
    <svg className="iso-art" viewBox={viewBox} aria-hidden="true" focusable="false">
      {shapes.map((shape, index) => {
        const box = boxes[index];
        return (
          <g key={index} className={box.accent ? "iso-box accent" : "iso-box"}>
            <polygon className="iso-left" points={poly(shape.left)} />
            <polygon className="iso-right" points={poly(shape.right)} />
            <polygon className="iso-top" points={poly(shape.top)} />
          </g>
        );
      })}
      {/* หมุดมุมแผ่นฐาน */}
      {[
        [0.06, 0.5],
        [0.5, 0.06],
        [0.94, 0.5],
        [0.5, 0.94],
      ].map(([u, v]) => {
        const [cx, cy] = onTop(slab, u, v);
        return <circle key={`${u}${v}`} className="iso-pin" cx={cx} cy={cy} r="1.3" />;
      })}
      {variant === "hub" && <HubMark box={boxes[1]} />}
      {(variant === "double" || variant === "single") &&
        boxes.slice(1).map((box, index) => (
          <g key={index}>
            {(variant === "double"
              ? [
                  [0.3, 0.3],
                  [0.5, 0.5],
                  [0.7, 0.7],
                ]
              : [
                  [0.3, 0.3],
                  [0.7, 0.3],
                  [0.5, 0.5],
                  [0.3, 0.7],
                  [0.7, 0.7],
                ]
            ).map(([u, v]) => {
              const [cx, cy] = onTop(box, u, v);
              return <circle key={`${u}${v}`} className="iso-dot" cx={cx} cy={cy} r="1.5" />;
            })}
          </g>
        ))}
      {variant === "you" &&
        [0.25, 0.45, 0.65].map((v, index) => {
          const box = boxes[1];
          const a = onTop(box, 0.2, v);
          const b = onTop(box, index === 0 ? 0.8 : 0.6, v);
          return (
            <line
              key={v}
              className={index === 0 ? "iso-line accent" : "iso-line"}
              x1={a[0]}
              y1={a[1]}
              x2={b[0]}
              y2={b[1]}
            />
          );
        })}
    </svg>
  );
}

function HubMark({ box }: { box: Box }) {
  const ring = Array.from({ length: 28 }, (_, i) => {
    const t = (i / 28) * Math.PI * 2;
    return onTop(box, 0.5 + Math.cos(t) * 0.75, 0.5 + Math.sin(t) * 0.75);
  });
  const [cx, cy] = onTop(box, 0.5, 0.5);
  return (
    <>
      <polygon className="iso-ring" points={poly(ring)} />
      <ellipse className="iso-core" cx={cx} cy={cy} rx="5" ry="2.9" />
    </>
  );
}
