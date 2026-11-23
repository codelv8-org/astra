/**
 * ธีมโลกของฉาก Home: เปลี่ยนแค่หน้าตา (สี พื้น แสง) ผังโต๊ะและงานใน Core เหมือนเดิม
 * แยกจาก OfficeScene เพื่อให้หน้า Themes ใช้ได้โดยไม่โหลด three.js
 * สีทุกตัวกำหนดเองสำหรับ Astra ไม่ได้มาจากภาพอ้างอิง
 */
export type WorldId = "office" | "longhouse" | "station" | "ship" | "frontier";

export interface World {
  id: WorldId;
  name: string;
  description: string;
  floor: { kind: "planks" | "plates"; tones: string[]; seam: string };
  /** [กลางคืน (ธีมมืด), กลางวัน (ธีมสว่าง)] */
  wall: [string, string];
  window: [string, string];
  background: [string, string];
  trim: string;
  rug: [string, string];
  lamp: string;
  lampBoost: number;
  leaves: string;
  stars?: boolean;
}

export const worlds: World[] = [
  {
    id: "office",
    name: "ออฟฟิศ",
    description: "ห้องทำงานไม้อุ่น ไฟโต๊ะสีส้ม หน้าต่างกลางคืน",
    floor: {
      kind: "planks",
      tones: ["#6b4329", "#734a2d", "#64402a", "#7a5032"],
      seam: "#4a2e1c",
    },
    wall: ["#3a2c24", "#cdb79c"],
    window: ["#1b2840", "#cfe6f5"],
    background: ["#0c0a09", "#e7e5e4"],
    trim: "#241a15",
    rug: ["#6b2f2a", "#7d3b30"],
    lamp: "#ffb35c",
    lampBoost: 1,
    leaves: "#3f7f4f",
  },
  {
    id: "longhouse",
    name: "โรงไม้ทางเหนือ",
    description: "ผนังซุงเข้ม พรมขนสัตว์ แสงไฟจากเตาผิง",
    floor: {
      kind: "planks",
      tones: ["#4a3423", "#523a27", "#45301f", "#5a4029"],
      seam: "#2e1f14",
    },
    wall: ["#4b3727", "#a88a68"],
    window: ["#3a1c0e", "#9fb6c8"],
    background: ["#0d0b08", "#e4ddd2"],
    trim: "#2e2115",
    rug: ["#6e5a44", "#857055"],
    lamp: "#ff8a3d",
    lampBoost: 1.25,
    leaves: "#4f6b3a",
  },
  {
    id: "station",
    name: "สถานีอวกาศ",
    description: "พื้นแผ่นโลหะ ไฟฟ้าอมฟ้า หน้าต่างมองเห็นดาว",
    floor: {
      kind: "plates",
      tones: ["#2c3440", "#313a47", "#2a313c", "#343e4c"],
      seam: "#1a1f27",
    },
    wall: ["#232a35", "#aab4c2"],
    window: ["#05070d", "#0b1020"],
    background: ["#06080c", "#d7dde6"],
    trim: "#151a21",
    rug: ["#1d4a55", "#23606b"],
    lamp: "#5ee6ff",
    lampBoost: 0.9,
    leaves: "#3fa58a",
    stars: true,
  },
  {
    id: "ship",
    name: "ดาดฟ้าเรือ",
    description: "ไม้ดาดฟ้าสีอ่อน ตัวเรือสีน้ำตาล ทะเลนอกหน้าต่าง",
    floor: {
      kind: "planks",
      tones: ["#8a6038", "#94683e", "#7f5733", "#9c7044"],
      seam: "#5c3c22",
    },
    wall: ["#5a3a21", "#b08a62"],
    window: ["#0e2233", "#7fb6d4"],
    background: ["#071018", "#cfe3ee"],
    trim: "#3f2814",
    rug: ["#6e5a3a", "#7d6845"],
    lamp: "#ffc070",
    lampBoost: 1,
    leaves: "#5c7f3f",
  },
  {
    id: "frontier",
    name: "เมืองชายแดน",
    description: "ผนังดินเผา พื้นไม้ฝุ่นจาง แสงอาทิตย์ยามเย็น",
    floor: {
      kind: "planks",
      tones: ["#8b5a35", "#96643c", "#7f522f", "#a06c42"],
      seam: "#5e3a20",
    },
    wall: ["#7a4a2a", "#d39a68"],
    window: ["#3a2030", "#f2c38b"],
    background: ["#120b07", "#f0e2cf"],
    trim: "#4f2f18",
    rug: ["#7a3f2a", "#94512f"],
    lamp: "#ffa64d",
    lampBoost: 1.1,
    leaves: "#6b8a3a",
  },
];

export const worldById = (id: string) =>
  worlds.find((world) => world.id === id) ?? worlds[0];

const storageKey = "astra-world";
export function readWorld(): WorldId {
  try {
    return worldById(localStorage.getItem(storageKey) ?? "").id;
  } catch {
    return "office";
  }
}
export function saveWorld(id: WorldId) {
  try {
    localStorage.setItem(storageKey, id);
  } catch {
    /* ไม่บังคับ: กลับเป็นออฟฟิศเมื่อเปิดใหม่ */
  }
}
