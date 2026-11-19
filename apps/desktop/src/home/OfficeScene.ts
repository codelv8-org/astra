import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";

/**
 * ฉาก 3D ของ Home: ออฟฟิศ CrewBots แบบ procedural (ไม่มีไฟล์โมเดลภายนอก)
 * สถานะของหุ่นมาจาก Core snapshot เท่านั้น ฉากนี้แค่ "แสดง" ไม่ได้จำลองผลงานขึ้นเอง
 */
export type SceneStatus = "idle" | "working" | "waiting" | "error" | "offline";
export interface SceneAgent {
  id: string;
  name: string;
  characterKey: string;
  status: SceneStatus;
  activity: string;
}
export interface SceneOptions {
  theme: "dark" | "light";
  reducedMotion: boolean;
  onSelect?: (agentId: string) => void;
}

const palette: Record<string, [string, string]> = {
  astra: ["#4169E1", "#F2C75C"],
  forge: ["#E98B3A", "#FFE0A3"],
  mira: ["#A597E8", "#F6BCD8"],
  vector: ["#36B7B0", "#A6F0E8"],
  scout: ["#879B4A", "#D5E89B"],
};
const statusColor: Record<SceneStatus, string> = {
  idle: "#7f8ba3",
  working: "#47d6a0",
  waiting: "#f2b84b",
  error: "#ff6b7f",
  offline: "#4a5266",
};
const themes = {
  dark: {
    bg: "#0b1020",
    floor: "#141c30",
    grid: "#2a3756",
    desk: "#202a40",
    wall: "#18213a",
  },
  light: {
    bg: "#e8edf6",
    floor: "#f7f9fd",
    grid: "#c9d4e6",
    desk: "#dfe6f2",
    wall: "#d3dcec",
  },
};

/** โต๊ะประจำตำแหน่ง: ASTRA อยู่โต๊ะบัญชาการกลาง ที่เหลือเรียงเป็นวงโค้ง */
const desks: Record<string, { x: number; z: number; face: number }> = {
  astra: { x: 0, z: 1.55, face: Math.PI },
  vector: { x: -4.1, z: -1.2, face: Math.PI * 0.62 },
  mira: { x: -1.6, z: -3.4, face: Math.PI * 0.86 },
  forge: { x: 1.6, z: -3.4, face: Math.PI * 1.14 },
  scout: { x: 4.1, z: -1.2, face: Math.PI * 1.38 },
};
const waypoints = [
  new THREE.Vector3(-4.6, 0, 2.6),
  new THREE.Vector3(4.6, 0, 2.6),
  new THREE.Vector3(-2.4, 0, 3.6),
  new THREE.Vector3(2.4, 0, 3.6),
  new THREE.Vector3(-5.2, 0, 0.6),
  new THREE.Vector3(5.2, 0, 0.6),
  new THREE.Vector3(0, 0, -1.4),
];

interface Bot {
  data: SceneAgent;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Mesh[];
  arms: THREE.Mesh[];
  beacon: THREE.MeshStandardMaterial;
  ring: THREE.MeshBasicMaterial;
  monitor: THREE.MeshStandardMaterial;
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

export class OfficeScene {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private bots = new Map<string, Bot>();
  private floorMat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  private deskMat = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.15,
  });
  private wallMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  private grid: THREE.GridHelper | null = null;
  private holo: THREE.Mesh;
  private holoMat: THREE.MeshBasicMaterial;
  private beams = new THREE.Group();
  private frame = 0;
  private observer: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private disposed = false;
  private options: SceneOptions;
  private lowPower: boolean;
  private minFrame: number;
  private sinceRender = 0;

  constructor(
    private host: HTMLElement,
    options: SceneOptions,
  ) {
    this.options = options;
    // GPU แบบ software (SwiftShader/WARP/llvmpipe เช่นเครื่อง CI หรือ VM) วาดช้ามาก
    // จึงปิดเงา/antialias และจำกัดเฟรมเพื่อไม่ให้ main thread ค้าง
    this.lowPower = softwareRenderer();
    this.minFrame = this.lowPower ? 1 / 12 : 0;
    host.dataset.quality = this.lowPower ? "low" : "high";
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.lowPower,
      alpha: false,
      powerPreference: this.lowPower ? "low-power" : "high-performance",
    });
    this.renderer.setPixelRatio(
      this.lowPower ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.lowPower;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "scene-labels";
    host.appendChild(this.labels.domElement);

    this.camera.position.set(0, 7.2, 10.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.6, -0.6);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 17;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.22;
    this.controls.autoRotateSpeed = 0.35;

    this.scene.add(new THREE.HemisphereLight("#cfe0ff", "#1a1f33", 1.1));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(5, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const rim = new THREE.PointLight("#4169E1", 18, 14);
    rim.position.set(0, 3, 1.5);
    this.scene.add(rim);

    this.buildOffice();
    this.holoMat = new THREE.MeshBasicMaterial({
      color: "#7DB4FF",
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    });
    this.holo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      this.holoMat,
    );
    this.holo.position.set(desks.astra.x, 1.2, desks.astra.z);
    this.holo.scale.setScalar(0.75);
    this.scene.add(this.holo, this.beams);

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
    const t = themes[theme];
    this.scene.background = new THREE.Color(t.bg);
    this.scene.fog = new THREE.Fog(t.bg, 16, 30);
    this.floorMat.color.set(t.floor);
    this.deskMat.color.set(t.desk);
    this.wallMat.color.set(t.wall);
    if (this.grid) this.scene.remove(this.grid);
    this.grid = new THREE.GridHelper(15, 30, t.grid, t.grid);
    this.grid.position.y = 0.011;
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.55;
    this.scene.add(this.grid);
  }

  setReducedMotion(reduced: boolean) {
    this.options.reducedMotion = reduced;
    this.controls.autoRotate = !reduced;
  }

  setAgents(agents: SceneAgent[]) {
    for (const agent of agents) {
      const bot = this.bots.get(agent.id) ?? this.createBot(agent);
      const changed = bot.data.status !== agent.status;
      bot.data = agent;
      bot.label.querySelector("b")!.textContent = agent.name;
      bot.label.querySelector("small")!.textContent = agent.activity;
      bot.label.dataset.status = agent.status;
      bot.beacon.color.set(statusColor[agent.status]);
      bot.beacon.emissive.set(statusColor[agent.status]);
      bot.ring.color.set(statusColor[agent.status]);
      const atDesk = agent.status !== "idle";
      bot.monitor.emissiveIntensity =
        agent.status === "working" ? 1.4 : atDesk ? 0.55 : 0.12;
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
      else material?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  private goToDesk(bot: Bot, desk: { x: number; z: number; face: number }) {
    // ยืนหน้าโต๊ะ หันเข้าหาจอ (โต๊ะบัญชาการกลมของ ASTRA กว้างกว่า)
    const gap = desk === desks.astra ? 1.55 : 0.95;
    bot.target.set(
      desk.x + Math.sin(desk.face) * gap,
      0,
      desk.z + Math.cos(desk.face) * gap,
    );
    bot.facing = desk.face + Math.PI;
    bot.wait = Number.POSITIVE_INFINITY;
    if (this.options.reducedMotion) bot.root.position.copy(bot.target);
  }

  private buildOffice() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 64),
      this.floorMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(8, 0.04, 8, 96),
      new THREE.MeshBasicMaterial({
        color: "#4169E1",
        transparent: true,
        opacity: 0.6,
      }),
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.02;
    this.scene.add(edge);

    // ผนังโค้งด้านหลังพร้อมแผงไฟ
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(
        7.6,
        7.6,
        2.6,
        48,
        1,
        true,
        Math.PI * 0.62,
        Math.PI * 0.76,
      ),
      this.wallMat,
    );
    wall.position.y = 1.3;
    wall.material.side = THREE.DoubleSide;
    wall.receiveShadow = true;
    this.scene.add(wall);
    for (let i = 0; i < 7; i++) {
      const angle = Math.PI * 0.68 + i * Math.PI * 0.107;
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.5),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? "#36B7B0" : "#4169E1",
          transparent: true,
          opacity: 0.35,
        }),
      );
      panel.position.set(Math.sin(angle) * 7.5, 1.75, Math.cos(angle) * 7.5);
      panel.lookAt(0, 1.75, 0);
      this.scene.add(panel);
    }

    for (const [key, desk] of Object.entries(desks)) this.buildDesk(key, desk);

    // ต้นไม้และจุดพักสำหรับหุ่นที่ว่าง
    for (const [x, z] of [
      [-5.6, 2.2],
      [5.6, 2.2],
    ]) {
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.22, 0.5, 20),
        this.deskMat,
      );
      pot.position.set(x, 0.25, z);
      const leaves = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.5, 1),
        new THREE.MeshStandardMaterial({
          color: "#3f9d78",
          roughness: 0.8,
          flatShading: true,
        }),
      );
      leaves.position.set(x, 0.95, z);
      pot.castShadow = leaves.castShadow = true;
      this.scene.add(pot, leaves);
    }
  }

  private buildDesk(key: string, desk: { x: number; z: number; face: number }) {
    const group = new THREE.Group();
    group.position.set(desk.x, 0, desk.z);
    group.rotation.y = desk.face;
    const command = key === "astra";
    const top = new THREE.Mesh(
      command
        ? new THREE.CylinderGeometry(1.15, 1.15, 0.12, 40)
        : new THREE.BoxGeometry(1.5, 0.1, 0.8),
      this.deskMat,
    );
    top.position.y = 0.78;
    top.castShadow = top.receiveShadow = true;
    const base = new THREE.Mesh(
      command
        ? new THREE.CylinderGeometry(0.5, 0.7, 0.74, 24)
        : new THREE.BoxGeometry(1.3, 0.72, 0.1),
      this.deskMat,
    );
    base.position.set(0, 0.37, command ? 0 : -0.3);
    base.castShadow = true;
    const color = palette[key]?.[0] ?? "#4169E1";
    const monitorMat = new THREE.MeshStandardMaterial({
      color: "#0d1426",
      emissive: color,
      emissiveIntensity: 0.12,
      roughness: 0.4,
    });
    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(command ? 0.9 : 0.8, 0.5, 0.05),
      monitorMat,
    );
    monitor.position.set(0, 1.12, command ? -0.75 : -0.22);
    monitor.castShadow = true;
    monitor.name = `monitor:${key}`;
    group.add(top, base, monitor);
    this.scene.add(group);
  }

  private createBot(agent: SceneAgent): Bot {
    const [main, soft] = palette[agent.characterKey] ?? ["#4169E1", "#F2C75C"];
    const mainMat = new THREE.MeshStandardMaterial({
      color: main,
      roughness: 0.45,
      metalness: 0.1,
    });
    const softMat = new THREE.MeshStandardMaterial({
      color: "#f4f7fb",
      roughness: 0.35,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: soft,
      roughness: 0.4,
    });
    const screenMat = new THREE.MeshStandardMaterial({
      color: "#0b1020",
      roughness: 0.2,
      metalness: 0.3,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: "#8ff7ff" });

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.24, 0.22, 6, 16),
      mainMat,
    );
    torso.position.y = 0.48;
    const belly = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), accentMat);
    belly.position.set(0, 0.5, 0.235);
    const feet = [-0.12, 0.12].map((x) => {
      const foot = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 14, 10),
        softMat,
      );
      foot.scale.set(1, 0.6, 1.3);
      foot.position.set(x, 0.07, 0.03);
      return foot;
    });
    const arms = [-1, 1].map((side) => {
      const arm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.06, 0.16, 4, 10),
        mainMat,
      );
      arm.position.set(side * 0.31, 0.5, 0.02);
      arm.rotation.z = side * 0.35;
      return arm;
    });
    body.add(torso, belly, ...feet, ...arms);

    // หัวใหญ่แบบ chibi + จอหน้าแสดงตา
    const head = new THREE.Group();
    head.position.y = 1.04;
    const shell =
      agent.characterKey === "forge"
        ? new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.66), softMat)
        : new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 20), softMat);
    if (agent.characterKey !== "forge") shell.scale.set(1.08, 0.86, 0.92);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.27, 28), screenMat);
    face.scale.set(1.2, 0.78, 1);
    face.position.z = agent.characterKey === "forge" ? 0.335 : 0.375;
    const eyes = [-0.11, 0.11].map((x) => {
      const eye = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.035, 0.06, 4, 8),
        eyeMat,
      );
      eye.position.set(x, 0.01, face.position.z + 0.01);
      return eye;
    });
    head.add(shell, face, ...eyes);

    // เอกลักษณ์ silhouette ของแต่ละตัว (ทรงเรขาคณิตต้นฉบับ)
    if (agent.characterKey === "astra") {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.035, 8, 32),
        accentMat,
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.48;
      head.add(halo);
    } else if (agent.characterKey === "mira") {
      for (const x of [-0.3, 0.3]) {
        const bun = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 16, 12),
          accentMat,
        );
        bun.position.set(x, 0.3, 0);
        head.add(bun);
      }
    } else if (agent.characterKey === "scout") {
      const visor = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.04, 8, 32, Math.PI),
        accentMat,
      );
      visor.position.set(0, 0.06, 0.05);
      visor.rotation.set(Math.PI / 2, 0, 0);
      head.add(visor);
    } else if (agent.characterKey === "vector") {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.025, 8, 20),
        accentMat,
      );
      ring.position.y = 0.72;
      head.add(ring);
    } else {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.08, 0.7),
        accentMat,
      );
      band.position.y = 0.22;
      head.add(band);
    }
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6),
      mainMat,
    );
    stalk.position.y = 0.46;
    const beacon = new THREE.MeshStandardMaterial({
      color: "#7f8ba3",
      emissive: "#7f8ba3",
      emissiveIntensity: 1.2,
    });
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 10),
      beacon,
    );
    bulb.position.y = 0.6;
    head.add(stalk, bulb);
    body.add(head);

    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.userData.agentId = agent.id;
      }
    });

    const ringMat = new THREE.MeshBasicMaterial({
      color: "#7f8ba3",
      transparent: true,
      opacity: 0.7,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.userData.agentId = agent.id;
    root.add(ring);

    const label = document.createElement("div");
    label.className = "bot-label";
    label.style.setProperty("--agent-color", main);
    label.innerHTML = "<b></b><small></small>";
    const tag = new CSS2DObject(label);
    tag.position.set(0, 1.85, 0);
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
        (monitor?.material as THREE.MeshStandardMaterial) ??
        new THREE.MeshStandardMaterial(),
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
    let working = 0;
    for (const bot of this.bots.values()) {
      if (bot.data.status !== "working") continue;
      working++;
      if (bot.data.characterKey === "astra") continue;
      const desk = desks[bot.data.characterKey];
      if (!desk) continue;
      const end = new THREE.Vector3(desk.x, 1.4, desk.z);
      const mid = this.holo.position.clone().lerp(end, 0.5);
      mid.y += 1.2;
      const curve = new THREE.QuadraticBezierCurve3(
        this.holo.position.clone(),
        mid,
        end,
      );
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)),
        new THREE.LineDashedMaterial({
          color: palette[bot.data.characterKey]?.[0] ?? "#7DB4FF",
          dashSize: 0.18,
          gapSize: 0.12,
          transparent: true,
          opacity: 0.85,
        }),
      );
      line.computeLineDistances();
      this.beams.add(line);
    }
    this.holoMat.color.set(working ? "#47d6a0" : "#7DB4FF");
  }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    this.sinceRender += this.clock.getDelta();
    if (this.sinceRender < this.minFrame) return;
    const dt = Math.min(this.sinceRender, 0.1);
    this.sinceRender = 0;
    const time = this.clock.elapsedTime;
    const still = this.options.reducedMotion;

    if (!still) {
      this.holo.rotation.y += dt * 0.6;
      this.holo.rotation.x += dt * 0.2;
    }
    // เส้นมอบหมายงาน ASTRA → ผู้รับงาน กระพริบเบา ๆ (คงที่เมื่อ reduced motion)
    this.beams.children.forEach((line) => {
      ((line as THREE.Line).material as THREE.Material).opacity = still
        ? 0.85
        : 0.55 + Math.sin(time * 3) * 0.3;
    });

    for (const bot of this.bots.values()) this.stepBot(bot, dt, time, still);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  private stepBot(bot: Bot, dt: number, time: number, still: boolean) {
    const { root, body, head, arms, data } = bot;
    const toTarget = bot.target.clone().sub(root.position);
    toTarget.y = 0;
    const distance = toTarget.length();
    const walking = distance > 0.05;

    if (walking) {
      const step = Math.min(distance, dt * 1.3);
      root.position.add(toTarget.normalize().multiplyScalar(step));
      this.turn(root, Math.atan2(toTarget.x, toTarget.z), dt * 6);
    } else {
      this.turn(root, bot.facing, dt * 4);
      bot.wait -= dt;
      if (
        data.status === "idle" &&
        data.characterKey !== "astra" &&
        bot.wait <= 0
      ) {
        // ว่างงาน: เดินเล่นไปจุดพักแบบสุ่ม
        const next = waypoints[Math.floor(Math.random() * waypoints.length)];
        bot.target.set(
          next.x + (Math.random() - 0.5) * 0.8,
          0,
          next.z + (Math.random() - 0.5) * 0.8,
        );
        bot.facing = Math.random() * Math.PI * 2;
        bot.wait = 3 + Math.random() * 5;
        if (still) root.position.copy(bot.target);
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
      // พิมพ์งานที่โต๊ะ
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
    bot.blink -= 1 / 60;
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
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.labels.setSize(width, height);
    this.camera.aspect = width / height;
    // จอแคบ: ถอยกล้องให้เห็นครบทั้งทีม
    this.camera.fov = width < 700 ? 58 : 42;
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
    this.renderer.domElement.style.cursor = this.pick(event)
      ? "pointer"
      : "grab";
  };

  private onVisibility = () => {
    if (!document.hidden) this.clock.getDelta();
  };
}
