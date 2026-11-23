import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { ROOM } from "./room";
import { worldById, type World, type WorldId } from "./worlds";

/**
 * ฉาก Home: ออฟฟิศ CrewBots มุมมอง isometric แบบ pixel (procedural ทั้งหมด ไม่มีไฟล์โมเดล/ภาพภายนอก)
 * วาดที่ความละเอียดต่ำแล้วขยายแบบ nearest-neighbor ให้เป็นพิกเซล ป้ายชื่อเป็น DOM จึงคมชัด
 * สถานะของหุ่นมาจาก Core snapshot เท่านั้น ฉากนี้แค่ "แสดง" ไม่ได้จำลองผลงานขึ้นเอง
 */
export type SceneStatus = "idle" | "working" | "waiting" | "error" | "offline";
export interface SceneAgent {
  id: string;
  name: string;
  characterKey: string;
  status: SceneStatus;
  activity: string;
  runtime?: string;
}
export interface SceneOptions {
  theme: "dark" | "light";
  reducedMotion: boolean;
  world?: WorldId;
  onSelect?: (agentId: string) => void;
}
export interface SceneMap {
  bots: { id: string; x: number; z: number; status: SceneStatus }[];
  /** มุมทั้งสี่ของภาพที่กล้องเห็นบนพื้น (x, z) */
  view: [number, number][];
}

export { ROOM };

const palette: Record<string, [string, string]> = {
  astra: ["#4169E1", "#F2C75C"],
  forge: ["#E98B3A", "#FFE0A3"],
  mira: ["#A597E8", "#F6BCD8"],
  vector: ["#36B7B0", "#A6F0E8"],
  scout: ["#879B4A", "#D5E89B"],
};
const statusColor: Record<SceneStatus, string> = {
  idle: "#8f8982",
  working: "#22c55e",
  waiting: "#ebae42",
  error: "#ef4444",
  offline: "#57534e",
};
const runtimeMonogram: Record<string, string> = {
  codex: "CX",
  claude: "CL",
  antigravity: "AG",
  mock: "MK",
};
/** แสงตามธีมแอป (มืด = กลางคืน, สว่าง = กลางวัน) สีของห้องมาจาก world */
const themes = {
  dark: {
    hemi: ["#ffe2bd", "#2a1d14", 1.05],
    sun: ["#b9c6ff", 0.7],
    lamp: 12,
    screen: 1,
  },
  light: {
    hemi: ["#fff4e0", "#7a6650", 1.15],
    sun: ["#fff1d6", 1.5],
    lamp: 2,
    screen: 0.6,
  },
} as const;

/** โต๊ะประจำตำแหน่ง: ASTRA โต๊ะประชุมกลม ที่เหลือหันหน้าเข้าผนัง */
const desks: Record<string, { x: number; z: number; face: number }> = {
  astra: { x: 0.8, z: 1.2, face: Math.PI },
  vector: { x: -4.4, z: -3.7, face: 0 },
  mira: { x: -1.4, z: -3.7, face: 0 },
  forge: { x: 1.6, z: -3.7, face: 0 },
  scout: { x: -5.9, z: 1.6, face: Math.PI / 2 },
};
const waypoints = [
  [3.6, 1.6],
  [4.6, 3.4],
  [-2.6, 3.4],
  [-3.6, 0.2],
  [2.4, 3.8],
  [5.2, -1.6],
  [-0.8, 3.9],
  [3.4, -1.4],
].map(([x, z]) => new THREE.Vector3(x, 0, z));

interface Bot {
  data: SceneAgent;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Mesh[];
  arms: THREE.Mesh[];
  beacon: THREE.MeshLambertMaterial;
  ring: THREE.MeshBasicMaterial;
  monitor: THREE.MeshLambertMaterial;
  label: HTMLDivElement;
  target: THREE.Vector3;
  facing: number;
  wait: number;
  phase: number;
  blink: number;
}

/** ตรวจว่า WebGL วาดด้วย CPU (ไม่มี GPU จริง) จากชื่อ renderer */
function softwareRenderer() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return true;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(
      gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    );
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|basic render|warp|software/i.test(
      name,
    );
  } catch {
    return true;
  }
}

const pixelTexture = (canvas: HTMLCanvasElement, repeat: [number, number]) => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/** พื้นแบบพิกเซลตาม world: ไม้กระดาน หรือแผ่นโลหะมีหมุด วาดด้วย canvas (ไม่มีไฟล์ภาพ) */
function floorTexture({ floor }: World) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const { tones, seam } = floor;
  if (floor.kind === "plates") {
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        ctx.fillStyle = tones[(row * 3 + col) % tones.length];
        ctx.fillRect(col * 16, row * 16, 16, 16);
        ctx.fillStyle = seam;
        ctx.fillRect(col * 16, row * 16, 16, 1);
        ctx.fillRect(col * 16, row * 16, 1, 16);
        ctx.fillRect(col * 16 + 3, row * 16 + 3, 1, 1);
        ctx.fillRect(col * 16 + 12, row * 16 + 12, 1, 1);
      }
  } else {
    for (let row = 0; row < 8; row++) {
      const offset = (row % 2) * 16;
      for (let col = -1; col < 3; col++) {
        ctx.fillStyle = tones[(row * 3 + col + 4) % tones.length];
        ctx.fillRect(col * 32 + offset, row * 8, 32, 8);
        ctx.fillStyle = seam;
        ctx.fillRect(col * 32 + offset, row * 8, 1, 8);
      }
      ctx.fillStyle = seam;
      ctx.fillRect(0, row * 8 + 7, 64, 1);
    }
  }
  return pixelTexture(canvas, [7, 5]);
}

/** ท้องฟ้ามีดาวสำหรับหน้าต่างของสถานีอวกาศ */
function starTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 20;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#05070d";
  ctx.fillRect(0, 0, 32, 20);
  ctx.fillStyle = "#dfe8ff";
  for (const [x, y] of [
    [3, 4],
    [11, 2],
    [17, 9],
    [26, 5],
    [7, 14],
    [22, 15],
    [29, 12],
    [14, 17],
  ])
    ctx.fillRect(x, y, 1, 1);
  return pixelTexture(canvas, [1, 1]);
}

const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export class OfficeScene {
  static readonly defaultZoom = 1.2;
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 200);
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private bots = new Map<string, Bot>();
  private wallMat = lambert("#3a2c24");
  private trimMat = lambert("#241a15");
  private windowMat = new THREE.MeshBasicMaterial({ color: "#1b2840" });
  private floorMat = new THREE.MeshLambertMaterial();
  private rugMat = lambert("#6b2f2a");
  private rugInnerMat = lambert("#7d3b30");
  private leavesMat = lambert("#3f7f4f");
  private themeName: "dark" | "light" = "dark";
  private world: World = worldById("office");
  private woodMat = lambert("#8a5a34");
  private darkWoodMat = lambert("#5a3820");
  private hemi = new THREE.HemisphereLight("#ffd9a8", "#1a120d", 0.5);
  private sun = new THREE.DirectionalLight("#9fb4ff", 0.35);
  private lamps: THREE.PointLight[] = [];
  private screens: THREE.MeshLambertMaterial[] = [];
  private holo: THREE.Mesh;
  private beams = new THREE.Group();
  private frame = 0;
  private observer: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private disposed = false;
  private options: SceneOptions;
  private lowPower: boolean;
  private pixelScale: number;
  private minFrame: number;
  private sinceRender = 0;
  private paused = false;
  private speed = 1;
  private focused: string | null = null;
  private panGoal: THREE.Vector3 | null = null;
  private screenLevel = 1;
  private readonly home = new THREE.Vector3(0, 0.6, -0.2);
  private readonly isoOffset = new THREE.Vector3(1, 0.82, 1)
    .normalize()
    .multiplyScalar(40);

  constructor(
    private host: HTMLElement,
    options: SceneOptions,
  ) {
    this.options = options;
    // GPU แบบ software (เครื่อง CI/VM) วาดช้า จึงปิดเงาและจำกัดเฟรม
    this.lowPower = softwareRenderer();
    this.minFrame = this.lowPower ? 1 / 12 : 0;
    this.pixelScale = this.lowPower ? 4 : 3;
    host.dataset.quality = this.lowPower ? "low" : "high";
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: this.lowPower ? "low-power" : "high-performance",
    });
    // วาดที่ 1/3 ของขนาดจอแล้วให้ CSS ขยายแบบ pixelated
    this.renderer.setPixelRatio(1 / this.pixelScale);
    this.renderer.shadowMap.enabled = !this.lowPower;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.renderer.domElement.classList.add("pixel-canvas");
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "scene-labels";
    host.appendChild(this.labels.domElement);

    this.camera.position.copy(this.home).add(this.isoOffset);
    this.camera.lookAt(this.home);
    this.camera.zoom = OfficeScene.defaultZoom;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.home);
    this.controls.enableRotate = false;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.enableDamping = true;
    this.controls.minZoom = 0.75;
    this.controls.maxZoom = 3;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    this.sun.position.set(-6, 12, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(512, 512);
    Object.assign(this.sun.shadow.camera, {
      left: -9,
      right: 9,
      top: 9,
      bottom: -9,
    });
    this.scene.add(this.hemi, this.sun);
    for (const [x, z] of [
      [-2.9, -3.2],
      [1.6, -3.2],
      [0.8, 1.2],
      [-5.4, 1.6],
    ]) {
      const lamp = new THREE.PointLight("#ffb35c", 12, 7, 1.4);
      lamp.position.set(x, 1.9, z);
      this.lamps.push(lamp);
      this.scene.add(lamp);
    }

    this.buildOffice();
    this.holo = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({ color: "#ebae42" }),
    );
    this.holo.position.set(desks.astra.x, 1.35, desks.astra.z);
    this.scene.add(this.holo, this.beams);

    this.world = worldById(options.world ?? "office");
    this.setTheme(options.theme);
    this.setReducedMotion(options.reducedMotion);
    this.renderer.domElement.addEventListener("click", this.onClick);
    this.renderer.domElement.addEventListener("pointermove", this.onHover);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.loop();
  }

  setTheme(theme: "dark" | "light") {
    this.themeName = theme;
    this.applyLook();
  }

  /** เปลี่ยนโลกของฉาก: สี พื้น และแสงเท่านั้น ผังโต๊ะและหุ่นเหมือนเดิม */
  setWorld(id: WorldId) {
    this.world = worldById(id);
    this.applyLook();
  }

  private applyLook() {
    const t = themes[this.themeName];
    const w = this.world;
    const day = this.themeName === "light" ? 1 : 0;
    this.scene.background = new THREE.Color(w.background[day]);
    this.wallMat.color.set(w.wall[day]);
    this.trimMat.color.set(w.trim);
    this.windowMat.map?.dispose();
    this.windowMat.map = w.stars ? starTexture() : null;
    this.windowMat.color.set(w.stars ? "#ffffff" : w.window[day]);
    this.windowMat.needsUpdate = true;
    this.floorMat.map?.dispose();
    this.floorMat.map = floorTexture(w);
    this.floorMat.needsUpdate = true;
    this.rugMat.color.set(w.rug[0]);
    this.rugInnerMat.color.set(w.rug[1]);
    this.leavesMat.color.set(w.leaves);
    this.hemi.color.set(t.hemi[0]);
    this.hemi.groundColor.set(t.hemi[1]);
    this.hemi.intensity = t.hemi[2];
    this.sun.color.set(t.sun[0]);
    this.sun.intensity = t.sun[1];
    this.lamps.forEach((lamp) => {
      lamp.color.set(w.lamp);
      lamp.intensity = t.lamp * w.lampBoost;
    });
    this.screenLevel = t.screen;
    this.refreshScreens();
  }

  /**
   * ภาพนิ่งหนึ่งเฟรมของโลกที่เลือก สำหรับการ์ดในหน้า Themes
   * สร้างฉากชั่วคราวนอกจอ วาดครั้งเดียว แล้วคืน WebGL context ทันที
   */
  static preview(
    world: WorldId,
    theme: "dark" | "light",
    agents: SceneAgent[],
    width = 480,
    height = 300,
  ) {
    const host = document.createElement("div");
    Object.assign(host.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: `${width}px`,
      height: `${height}px`,
    });
    document.body.appendChild(host);
    const scene = new OfficeScene(host, { theme, reducedMotion: true, world });
    try {
      scene.setAgents(agents);
      scene.resize();
      scene.renderer.render(scene.scene, scene.camera);
      // คัดลอกเป็น canvas 2D แทน data URL: CSP ของ Tauri อนุญาต img-src เฉพาะ 'self'/asset
      const source = scene.renderer.domElement;
      const copy = document.createElement("canvas");
      copy.width = source.width;
      copy.height = source.height;
      copy.getContext("2d")?.drawImage(source, 0, 0);
      return copy;
    } finally {
      scene.dispose();
      host.remove();
    }
  }

  setReducedMotion(reduced: boolean) {
    this.options.reducedMotion = reduced;
  }

  /** หยุดการเคลื่อนไหวของฉาก (ไม่กระทบงานจริงใน Core) */
  setPaused(paused: boolean) {
    this.paused = paused;
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  zoomBy(factor: number) {
    this.camera.zoom = THREE.MathUtils.clamp(
      this.camera.zoom * factor,
      this.controls.minZoom,
      this.controls.maxZoom,
    );
    this.camera.updateProjectionMatrix();
  }

  /** กลับไปมุมมองทั้งห้อง */
  fit() {
    this.camera.zoom = OfficeScene.defaultZoom;
    this.camera.updateProjectionMatrix();
    this.panGoal = this.home.clone();
  }

  /** เลื่อนกล้องไปยังจุดบนพื้น (x, z) */
  panTo(x: number, z: number) {
    this.panGoal = new THREE.Vector3(x, this.home.y, z);
  }

  setFocus(agentId: string | null) {
    this.focused = agentId;
    for (const [id, bot] of this.bots)
      bot.label.dataset.focused = String(id === agentId);
    const bot = agentId ? this.bots.get(agentId) : undefined;
    if (bot) this.panTo(bot.root.position.x, bot.root.position.z);
  }

  mapState(): SceneMap {
    const view: [number, number][] = [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
    ].map(([x, y]) => {
      this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
      const hit = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(this.floorPlane, hit);
      return [hit.x, hit.z];
    });
    return {
      bots: [...this.bots.values()].map((bot) => ({
        id: bot.data.id,
        x: bot.root.position.x,
        z: bot.root.position.z,
        status: bot.data.status,
      })),
      view,
    };
  }

  setAgents(agents: SceneAgent[]) {
    for (const agent of agents) {
      const bot = this.bots.get(agent.id) ?? this.createBot(agent);
      const changed = bot.data.status !== agent.status;
      bot.data = agent;
      bot.label.querySelector("b")!.textContent = agent.name;
      bot.label.querySelector("small")!.textContent = agent.activity;
      const badge = bot.label.querySelector<HTMLElement>(".runtime-badge")!;
      badge.dataset.runtime = agent.runtime ?? "";
      badge.textContent = runtimeMonogram[agent.runtime ?? ""] ?? "··";
      bot.label.dataset.status = agent.status;
      bot.label.dataset.focused = String(agent.id === this.focused);
      bot.beacon.color.set(statusColor[agent.status]);
      bot.beacon.emissive.set(statusColor[agent.status]);
      bot.ring.color.set(statusColor[agent.status]);
      const atDesk = agent.status !== "idle";
      bot.monitor.userData.level =
        agent.status === "working" ? 1.3 : atDesk ? 0.55 : 0.15;
      if (changed || atDesk) {
        const desk = desks[agent.characterKey] ?? desks.astra;
        if (atDesk || agent.characterKey === "astra") this.goToDesk(bot, desk);
        else bot.wait = 0;
      }
    }
    for (const [id, bot] of this.bots)
      if (!agents.some((agent) => agent.id === id)) {
        this.scene.remove(bot.root);
        this.bots.delete(id);
      }
    this.refreshScreens();
    this.rebuildBeams();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.renderer.domElement.removeEventListener("click", this.onClick);
    this.renderer.domElement.removeEventListener("pointermove", this.onHover);
    this.controls.dispose();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as
        | THREE.Material
        | THREE.Material[]
        | undefined;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else {
        (material as THREE.MeshLambertMaterial | undefined)?.map?.dispose();
        material?.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  private refreshScreens() {
    for (const screen of this.screens)
      screen.emissiveIntensity =
        (screen.userData.level ?? 0.15) * this.screenLevel;
  }

  private goToDesk(bot: Bot, desk: { x: number; z: number; face: number }) {
    const gap = desk === desks.astra ? 1.55 : 0.9;
    bot.target.set(
      desk.x + Math.sin(desk.face) * gap,
      0,
      desk.z + Math.cos(desk.face) * gap,
    );
    bot.facing = desk.face + Math.PI;
    bot.wait = Number.POSITIVE_INFINITY;
    if (this.options.reducedMotion) bot.root.position.copy(bot.target);
  }

  private box(
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    parent: THREE.Object3D = this.scene,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = !this.lowPower;
    parent.add(mesh);
    return mesh;
  }

  private buildOffice() {
    const { minX, maxX, minZ, maxZ } = ROOM;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      this.floorMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // ขอบพื้นให้ห้องดูเป็นก้อน isometric
    this.box([width, 0.3, 0.2], [0, -0.15, maxZ + 0.1], this.trimMat);
    this.box([0.2, 0.3, depth], [maxX + 0.1, -0.15, 0], this.trimMat);

    // ผนังหลังและผนังซ้าย พร้อมบัวผนัง
    this.box([width, 2.8, 0.2], [0, 1.4, minZ - 0.1], this.wallMat);
    this.box([0.2, 2.8, depth], [minX - 0.1, 1.4, 0], this.wallMat);
    this.box([width, 0.16, 0.24], [0, 0.08, minZ], this.trimMat);
    this.box([0.24, 0.16, depth], [minX, 0.08, 0], this.trimMat);
    for (const x of [-4.4, -1.4, 1.6]) {
      this.box([1.6, 1, 0.04], [x, 1.85, minZ + 0.02], this.trimMat);
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.82),
        this.windowMat,
      );
      pane.position.set(x, 1.85, minZ + 0.05);
      this.scene.add(pane);
    }

    // พรมใต้โต๊ะประชุม
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 3.4),
      this.rugMat,
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(desks.astra.x, 0.01, desks.astra.z);
    rug.receiveShadow = true;
    const rugInner = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 2.8),
      this.rugInnerMat,
    );
    rugInner.rotation.x = -Math.PI / 2;
    rugInner.position.set(desks.astra.x, 0.015, desks.astra.z);
    this.scene.add(rug, rugInner);

    for (const [key, desk] of Object.entries(desks)) this.buildDesk(key, desk);

    // ชั้นหนังสือ ตู้ server กระดาน และต้นไม้
    this.buildShelf(-6.7, -2.4, Math.PI / 2);
    this.buildShelf(5.6, -4.7, 0);
    const rack = this.box([0.9, 2, 0.8], [4.1, 1, -4.4], lambert("#1c1d22"));
    const led = new THREE.MeshBasicMaterial({ color: "#3ddc84" });
    for (let i = 0; i < 6; i++)
      this.box(
        [0.06, 0.04, 0.02],
        [-0.3 + (i % 3) * 0.12, -0.6 + Math.floor(i / 3) * 0.5, 0.41],
        led,
        rack,
      );
    this.box([1.5, 0.95, 0.05], [3.4, 1.6, -4.85], lambert("#ecebe7"));
    for (const [x, z] of [
      [-6.4, -4.4],
      [6.4, 4.4],
      [-6.3, 4.3],
      [2.9, -4.5],
      [6.4, -1.2],
    ])
      this.buildPlant(x, z);
  }

  private buildDesk(key: string, desk: { x: number; z: number; face: number }) {
    const group = new THREE.Group();
    group.position.set(desk.x, 0, desk.z);
    group.rotation.y = desk.face;
    const command = key === "astra";
    let monitorZ = -0.22;
    if (command) {
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.05, 0.1, 16),
        this.woodMat,
      );
      top.position.y = 0.74;
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.3, 0.72, 8),
        this.darkWoodMat,
      );
      leg.position.y = 0.36;
      top.castShadow = top.receiveShadow = leg.castShadow = !this.lowPower;
      group.add(top, leg);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + 0.6;
        const chair = new THREE.Group();
        chair.position.set(Math.sin(angle) * 1.45, 0, Math.cos(angle) * 1.45);
        chair.rotation.y = angle;
        this.box([0.5, 0.08, 0.5], [0, 0.45, 0], lambert("#3a3a40"), chair);
        this.box([0.5, 0.5, 0.08], [0, 0.72, 0.24], lambert("#33333a"), chair);
        group.add(chair);
      }
      monitorZ = -0.4;
    } else {
      this.box([1.6, 0.08, 0.8], [0, 0.74, 0], this.woodMat, group);
      for (const [x, z] of [
        [-0.72, -0.32],
        [0.72, -0.32],
        [-0.72, 0.32],
        [0.72, 0.32],
      ])
        this.box([0.08, 0.7, 0.08], [x, 0.35, z], this.darkWoodMat, group);
      this.box([0.5, 0.03, 0.18], [0, 0.8, 0.12], lambert("#2a2a2e"), group);
      const chair = new THREE.Group();
      chair.position.set(0, 0, 0.75);
      this.box([0.5, 0.08, 0.5], [0, 0.45, 0], lambert("#3a3a40"), chair);
      this.box([0.5, 0.55, 0.08], [0, 0.75, 0.24], lambert("#33333a"), chair);
      group.add(chair);
    }
    const color = palette[key]?.[1] ?? "#a6f0e8";
    const monitorMat = new THREE.MeshLambertMaterial({
      color: "#101418",
      emissive: color,
      emissiveIntensity: 0.15,
    });
    monitorMat.userData.level = 0.15;
    this.screens.push(monitorMat);
    const monitor = this.box(
      [command ? 0.6 : 0.72, 0.44, 0.05],
      [0, 1.06, monitorZ],
      monitorMat,
      group,
    );
    monitor.name = `monitor:${key}`;
    this.box([0.06, 0.2, 0.06], [0, 0.86, monitorZ - 0.03], lambert("#2a2a2e"), group);
    this.scene.add(group);
  }

  private buildShelf(x: number, z: number, rotation: number) {
    const shelf = new THREE.Group();
    shelf.position.set(x, 0, z);
    shelf.rotation.y = rotation;
    this.box([1.8, 2.1, 0.45], [0, 1.05, 0], this.darkWoodMat, shelf);
    const books = ["#7a3b2e", "#2f5d50", "#c08a3e", "#3d4f7a", "#6b6b3a", "#8c6a8f"];
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 9; i++)
        this.box(
          [0.13, 0.42 - (i % 3) * 0.05, 0.3],
          [-0.72 + i * 0.18, 0.5 + row * 0.62, 0.1],
          lambert(books[(row * 5 + i * 7) % books.length]),
          shelf,
        );
    this.scene.add(shelf);
  }

  private buildPlant(x: number, z: number) {
    this.box([0.4, 0.42, 0.4], [x, 0.21, z], lambert("#7a4a2f"));
    const leaves = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 0),
      this.leavesMat,
    );
    leaves.position.set(x, 0.78, z);
    leaves.castShadow = !this.lowPower;
    this.scene.add(leaves);
  }

  private createBot(agent: SceneAgent): Bot {
    const [main, soft] = palette[agent.characterKey] ?? ["#4169E1", "#F2C75C"];
    const mainMat = lambert(main);
    const softMat = lambert("#efece6");
    const accentMat = lambert(soft);
    const screenMat = lambert("#0b1020");
    const eyeMat = new THREE.MeshBasicMaterial({ color: "#8ff7ff" });

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.24, 0.22, 2, 8),
      mainMat,
    );
    torso.position.y = 0.48;
    const belly = new THREE.Mesh(new THREE.CircleGeometry(0.11, 8), accentMat);
    belly.position.set(0, 0.5, 0.235);
    const feet = [-0.12, 0.12].map((x) => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.24), softMat);
      foot.position.set(x, 0.05, 0.03);
      return foot;
    });
    const arms = [-1, 1].map((side) => {
      const arm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.06, 0.16, 2, 6),
        mainMat,
      );
      arm.position.set(side * 0.31, 0.5, 0.02);
      arm.rotation.z = side * 0.35;
      return arm;
    });
    body.add(torso, belly, ...feet, ...arms);

    const head = new THREE.Group();
    head.position.y = 1.04;
    const shell =
      agent.characterKey === "forge"
        ? new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.66), softMat)
        : new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), softMat);
    if (agent.characterKey !== "forge") shell.scale.set(1.08, 0.86, 0.92);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.27, 10), screenMat);
    face.scale.set(1.2, 0.78, 1);
    face.position.z = agent.characterKey === "forge" ? 0.335 : 0.375;
    const eyes = [-0.11, 0.11].map((x) => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.02), eyeMat);
      eye.position.set(x, 0.01, face.position.z + 0.01);
      return eye;
    });
    head.add(shell, face, ...eyes);

    // เอกลักษณ์ silhouette ของแต่ละตัว (ทรงเรขาคณิตต้นฉบับ)
    if (agent.characterKey === "astra") {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.035, 4, 12),
        accentMat,
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.48;
      head.add(halo);
    } else if (agent.characterKey === "mira") {
      for (const x of [-0.3, 0.3]) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), accentMat);
        bun.position.set(x, 0.3, 0);
        head.add(bun);
      }
    } else if (agent.characterKey === "scout") {
      const visor = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.04, 4, 12, Math.PI),
        accentMat,
      );
      visor.position.set(0, 0.06, 0.05);
      visor.rotation.set(Math.PI / 2, 0, 0);
      head.add(visor);
    } else if (agent.characterKey === "vector") {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.025, 4, 8),
        accentMat,
      );
      ring.position.y = 0.72;
      head.add(ring);
    } else {
      this.box([0.82, 0.08, 0.7], [0, 0.22, 0], accentMat, head);
    }
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.22, 4),
      mainMat,
    );
    stalk.position.y = 0.46;
    const beacon = new THREE.MeshLambertMaterial({
      color: statusColor.idle,
      emissive: statusColor.idle,
      emissiveIntensity: 1.2,
    });
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), beacon);
    bulb.position.y = 0.6;
    head.add(stalk, bulb);
    body.add(head);

    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = !this.lowPower;
        object.userData.agentId = agent.id;
      }
    });

    const ringMat = new THREE.MeshBasicMaterial({
      color: statusColor.idle,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 4), ringMat);
    ring.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    ring.position.y = 0.02;
    ring.userData.agentId = agent.id;
    root.add(ring);

    const label = document.createElement("div");
    label.className = "bot-label";
    label.innerHTML =
      '<span class="runtime-badge" aria-hidden="true"></span><span class="bot-label-text"><b></b><small></small></span>';
    const tag = new CSS2DObject(label);
    tag.position.set(0, 1.95, 0);
    root.add(tag);

    const desk = desks[agent.characterKey] ?? desks.astra;
    root.position.set(
      desk.x + Math.sin(desk.face) * 1.6,
      0,
      desk.z + Math.cos(desk.face) * 1.6,
    );
    this.scene.add(root);

    const monitor = this.scene.getObjectByName(
      `monitor:${agent.characterKey}`,
    ) as THREE.Mesh | undefined;
    const bot: Bot = {
      data: agent,
      root,
      body,
      head,
      eyes,
      arms,
      beacon,
      ring: ringMat,
      monitor:
        (monitor?.material as THREE.MeshLambertMaterial) ??
        new THREE.MeshLambertMaterial(),
      label,
      target: root.position.clone(),
      facing: desk.face + Math.PI,
      wait: 1 + Math.random() * 3,
      phase: Math.random() * Math.PI * 2,
      blink: 2 + Math.random() * 3,
    };
    this.bots.set(agent.id, bot);
    return bot;
  }

  private rebuildBeams() {
    for (const child of [...this.beams.children]) {
      this.beams.remove(child);
      (child as THREE.Line).geometry.dispose();
      ((child as THREE.Line).material as THREE.Material).dispose();
    }
    for (const bot of this.bots.values()) {
      if (bot.data.status !== "working" || bot.data.characterKey === "astra")
        continue;
      const desk = desks[bot.data.characterKey];
      if (!desk) continue;
      const end = new THREE.Vector3(desk.x, 1.3, desk.z);
      const mid = this.holo.position.clone().lerp(end, 0.5);
      mid.y += 1.1;
      const curve = new THREE.QuadraticBezierCurve3(
        this.holo.position.clone(),
        mid,
        end,
      );
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),
        new THREE.LineDashedMaterial({
          color: "#ebae42",
          dashSize: 0.2,
          gapSize: 0.14,
          transparent: true,
          opacity: 0.9,
        }),
      );
      line.computeLineDistances();
      this.beams.add(line);
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    this.sinceRender += this.clock.getDelta();
    if (this.sinceRender < this.minFrame) return;
    const dt = Math.min(this.sinceRender, 0.1) * this.speed;
    this.sinceRender = 0;
    const time = this.clock.elapsedTime * this.speed;
    const still = this.options.reducedMotion || this.paused;

    if (!still) this.holo.rotation.y += dt * 0.8;
    this.beams.children.forEach((line) => {
      ((line as THREE.Line).material as THREE.Material).opacity = still
        ? 0.9
        : 0.6 + Math.sin(time * 3) * 0.3;
    });
    for (const screen of this.screens)
      screen.emissiveIntensity +=
        ((screen.userData.level ?? 0.15) * this.screenLevel -
          screen.emissiveIntensity) *
        0.1;

    for (const bot of this.bots.values()) this.stepBot(bot, dt, time, still);
    this.stepCamera();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  /** เลื่อนกล้องไปยังเป้าหมายแบบนุ่มนวล และกันไม่ให้หลุดออกนอกห้อง */
  private stepCamera() {
    const target = this.controls.target;
    if (this.panGoal) {
      const step = this.panGoal
        .clone()
        .sub(target)
        .multiplyScalar(this.options.reducedMotion ? 1 : 0.12);
      target.add(step);
      this.camera.position.add(step);
      if (target.distanceTo(this.panGoal) < 0.02) this.panGoal = null;
    }
    const clamped = target.clone();
    clamped.x = THREE.MathUtils.clamp(clamped.x, ROOM.minX, ROOM.maxX);
    clamped.z = THREE.MathUtils.clamp(clamped.z, ROOM.minZ, ROOM.maxZ);
    clamped.y = this.home.y;
    if (!clamped.equals(target)) {
      const fix = clamped.sub(target);
      target.add(fix);
      this.camera.position.add(fix);
    }
  }

  private stepBot(bot: Bot, dt: number, time: number, still: boolean) {
    const { root, body, head, arms, data } = bot;
    const toTarget = bot.target.clone().sub(root.position);
    toTarget.y = 0;
    const distance = toTarget.length();
    const walking = distance > 0.05 && !this.paused;

    if (walking) {
      const step = Math.min(distance, dt * 1.3);
      root.position.add(toTarget.normalize().multiplyScalar(step));
      this.turn(root, Math.atan2(toTarget.x, toTarget.z), dt * 6);
    } else if (!this.paused) {
      this.turn(root, bot.facing, dt * 4);
      bot.wait -= dt;
      if (
        data.status === "idle" &&
        data.characterKey !== "astra" &&
        bot.wait <= 0
      ) {
        const next = waypoints[Math.floor(Math.random() * waypoints.length)];
        bot.target.set(
          next.x + (Math.random() - 0.5) * 0.8,
          0,
          next.z + (Math.random() - 0.5) * 0.8,
        );
        bot.facing = Math.random() * Math.PI * 2;
        bot.wait = 3 + Math.random() * 5;
        if (this.options.reducedMotion) root.position.copy(bot.target);
      }
    }

    if (still) {
      body.position.y = 0;
      arms.forEach((arm) => (arm.rotation.x = 0));
      return;
    }
    const t = time + bot.phase;
    if (walking) {
      body.position.y = Math.abs(Math.sin(t * 9)) * 0.06;
      arms[0].rotation.x = Math.sin(t * 9) * 0.6;
      arms[1].rotation.x = -Math.sin(t * 9) * 0.6;
      head.rotation.z = 0;
    } else if (data.status === "working") {
      body.position.y = Math.sin(t * 2) * 0.01;
      arms[0].rotation.x = -1.1 + Math.sin(t * 14) * 0.18;
      arms[1].rotation.x = -1.1 + Math.cos(t * 13) * 0.18;
      head.rotation.x = 0.12 + Math.sin(t * 1.5) * 0.03;
      head.rotation.z = 0;
    } else if (data.status === "waiting") {
      body.position.y = Math.sin(t * 1.4) * 0.02;
      arms.forEach((arm) => (arm.rotation.x = 0));
      head.rotation.z = Math.sin(t * 0.9) * 0.12;
    } else if (data.status === "error") {
      body.position.y = 0;
      head.rotation.x = 0.3;
      head.rotation.z = Math.sin(t * 6) * 0.05;
    } else {
      body.position.y = Math.sin(t * 2) * 0.025;
      arms.forEach((arm) => (arm.rotation.x = Math.sin(t * 2) * 0.08));
      head.rotation.set(0, Math.sin(t * 0.7) * 0.25, 0);
    }
    bot.blink -= dt;
    const closed = bot.blink < 0.12;
    bot.eyes.forEach((eye) => (eye.scale.y = closed ? 0.15 : 1));
    if (bot.blink < 0) bot.blink = 2.5 + Math.random() * 3;
  }

  private turn(object: THREE.Object3D, angle: number, amount: number) {
    let delta = angle - object.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    object.rotation.y += delta * Math.min(1, amount);
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.labels.setSize(width, height);
    const aspect = width / height;
    // ให้เห็นทั้งห้องในแนวนอนเสมอ ทั้งจอกว้างและคอลัมน์แคบ
    const halfH = Math.max(6.2, 9 / aspect);
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  private pick(event: PointerEvent | MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const roots = [...this.bots.values()].map((bot) => bot.root);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    return hit?.object.userData.agentId as string | undefined;
  }

  private onClick = (event: MouseEvent) => {
    const id = this.pick(event);
    if (id) this.options.onSelect?.(id);
  };

  private onHover = (event: PointerEvent) => {
    if (event.buttons) return;
    this.renderer.domElement.style.cursor = this.pick(event)
      ? "pointer"
      : "grab";
  };

  private onVisibility = () => {
    if (!document.hidden) this.clock.getDelta();
  };
}
