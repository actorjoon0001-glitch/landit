"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type * as THREE_NS from "three";
import { type Land, type ModularHouse, eok, won, landTotal } from "@/lib/data";

/* ------------------------------------------------------------------ *
 * 직접 짓기 빌더 모드 (심시티 스타일)
 * 격자 위에 정지작업 → 기초 → 주택 → 데크/조경을 직접 배치.
 * 좌클릭 배치(정지작업은 드래그 페인트), R 회전, 우클릭 드래그 카메라.
 * ------------------------------------------------------------------ */

const N = 8; // 격자 칸수 (N x N)
const CELL = 0.75; // 칸 크기 → 대지 6x6
const HALF = (N * CELL) / 2;

type ToolKey = "grade" | "foundation" | "house" | "deck" | "tree" | "lamp" | "demolish";

interface ToolDef {
  key: ToolKey;
  icon: string;
  label: string;
  price: number; // KRW (주택은 별도)
  fw: number; // footprint w (cells)
  fd: number;
  h: number; // 고스트 높이
  desc: string;
}

const TOOLS: ToolDef[] = [
  { key: "grade", icon: "🚜", label: "정지작업", price: 300_000, fw: 1, fd: 1, h: 0.04, desc: "드래그로 땅을 고릅니다 (칸당 30만원)" },
  { key: "foundation", icon: "🧱", label: "기초공사", price: 8_000_000, fw: 4, fd: 3, h: 0.35, desc: "정지된 땅 위에만 시공 가능" },
  { key: "house", icon: "🏠", label: "주택 설치", price: 0, fw: 4, fd: 3, h: 1.9, desc: "기초 위에만 앉힐 수 있습니다" },
  { key: "deck", icon: "🪵", label: "데크", price: 1_800_000, fw: 1, fd: 3, h: 0.18, desc: "주택에 붙여서 설치 (R로 회전)" },
  { key: "tree", icon: "🌳", label: "조경수", price: 150_000, fw: 1, fd: 1, h: 1.6, desc: "잔디 위에 심습니다" },
  { key: "lamp", icon: "💡", label: "정원등", price: 80_000, fw: 1, fd: 1, h: 0.55, desc: "어디든 설치 가능" },
  { key: "demolish", icon: "⛏️", label: "철거", price: 0, fw: 1, fd: 1, h: 0.04, desc: "설치물 제거 / 정지작업 되돌리기" },
];

interface PlacedObj {
  id: number;
  type: ToolKey;
  cells: [number, number][];
  group: THREE_NS.Object3D;
}

interface CostItem {
  label: string;
  amount: number;
}

type Api = { reset: () => void; dispose: () => void; setTool: (t: ToolKey, rot: number) => void };

export default function Builder({ land, house }: { land: Land; house: ModularHouse }) {
  const [tool, setToolState] = useState<ToolKey>("grade");
  const [rot, setRot] = useState(0);
  const [items, setItems] = useState<CostItem[]>([]);
  const [hint, setHint] = useState<string>("도구를 고르고 땅을 클릭하세요");
  const [ready, setReady] = useState(false);
  const [sent, setSent] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  const landPrice = landTotal(land);
  const buildCost = items.reduce((s, i) => s + i.amount, 0);
  const total = landPrice + buildCost;

  // 도구/회전 변경을 3D 쪽에 전달
  useEffect(() => {
    apiRef.current?.setTool(tool, rot);
  }, [tool, rot]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const THREE = (await import("three")) as typeof THREE_NS;
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
      const { SSAOPass } = await import("three/addons/postprocessing/SSAOPass.js");
      const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");
      const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
      const { SMAAPass } = await import("three/addons/postprocessing/SMAAPass.js");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const mount = mountRef.current;
      if (disposed || !mount) return;

      const W = mount.clientWidth || 800;
      const H = mount.clientHeight || 480;
      const DPR = Math.min(window.devicePixelRatio, 2);

      /* ---------- 텍스처 ---------- */
      const canvasTex = (draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat: number) => {
        const s = 256;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const ctx = c.getContext("2d")!;
        draw(ctx, s);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        t.anisotropy = 8;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const grain = (ctx: CanvasRenderingContext2D, s: number, base: string, amp: number) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, s, s);
        const img = ctx.getImageData(0, 0, s, s);
        for (let i = 0; i < img.data.length; i += 4) {
          const n = (Math.random() - 0.5) * amp;
          img.data[i] += n;
          img.data[i + 1] += n;
          img.data[i + 2] += n;
        }
        ctx.putImageData(img, 0, 0);
      };
      const grassTex = canvasTex((ctx, s) => grain(ctx, s, "#6f9a52", 26), 5);
      const dirtTex = canvasTex((ctx, s) => grain(ctx, s, "#ac8a60", 22), 3);
      const concTex = canvasTex((ctx, s) => grain(ctx, s, "#cbc6bb", 12), 3);

      /* ---------- 씬 ---------- */
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#cfe3f0");
      scene.fog = new THREE.Fog("#cfe3f0", 26, 55);
      const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
      camera.position.set(7.2, 5.6, 7.6);

      const renderer = new THREE.WebGLRenderer({ antialias: false });
      renderer.setPixelRatio(DPR);
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      mount.appendChild(renderer.domElement);
      renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.32;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.5, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 6;
      controls.maxDistance = 20;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = 1.3;
      // 좌클릭은 배치용으로 비움 — 카메라 회전은 우클릭
      controls.mouseButtons = {
        LEFT: undefined as unknown as THREE_NS.MOUSE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };

      scene.add(new THREE.HemisphereLight(0xdcefff, 0x5f5238, 0.32));
      const sun = new THREE.DirectionalLight(0xfff3dc, 2.6);
      sun.position.set(7, 11, 5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -8;
      sun.shadow.camera.right = 8;
      sun.shadow.camera.top = 8;
      sun.shadow.camera.bottom = -8;
      sun.shadow.camera.far = 36;
      sun.shadow.bias = -0.0003;
      sun.shadow.normalBias = 0.03;
      scene.add(sun);

      const mat = (color: string, o: { rough?: number; metal?: number; emissive?: string; emi?: number; map?: THREE_NS.Texture; flat?: boolean } = {}) =>
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: o.rough ?? 0.85,
          metalness: o.metal ?? 0,
          flatShading: o.flat ?? false,
          map: o.map,
          emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color(0),
          emissiveIntensity: o.emi ?? 0,
        });
      const box = (w: number, h: number, d: number, color: string, pos: [number, number, number], o: Parameters<typeof mat>[1] = {}) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
        m.position.set(...pos);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
      };

      // 지면
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), mat("#688750", { rough: 1, map: grassTex }));
      (outer.material.map as THREE_NS.Texture).repeat.set(30, 30);
      outer.rotation.x = -Math.PI / 2;
      outer.position.y = -0.02;
      outer.receiveShadow = true;
      scene.add(outer);
      const plot = box(N * CELL, 0.26, N * CELL, "#6f9a52", [0, -0.13, 0], { rough: 1, map: grassTex });
      plot.castShadow = false;
      scene.add(plot);
      scene.add(box(N * CELL - 0.1, 0.7, N * CELL - 0.1, "#6b4f34", [0, -0.55, 0], { rough: 1, map: dirtTex }));

      // 격자선
      const gridHelper = new THREE.Group();
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 });
      for (let k = 0; k <= N; k++) {
        const p = -HALF + k * CELL;
        const g1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p, 0.012, -HALF), new THREE.Vector3(p, 0.012, HALF)]);
        const g2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-HALF, 0.012, p), new THREE.Vector3(HALF, 0.012, p)]);
        gridHelper.add(new THREE.Line(g1, lineMat), new THREE.Line(g2, lineMat));
      }
      scene.add(gridHelper);

      /* ---------- 게임 상태 ---------- */
      const graded: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
      const gradeTiles: (THREE_NS.Mesh | null)[][] = Array.from({ length: N }, () => Array(N).fill(null));
      const occupied: (number | null)[][] = Array.from({ length: N }, () => Array(N).fill(null));
      const objects = new Map<number, PlacedObj>();
      let nextId = 1;
      let curTool: ToolKey = "grade";
      let curRot = 0;
      let houseTemplate: THREE_NS.Object3D | null = null;

      // GLB 주택 템플릿 로드 (실패 시 절차적 폴백)
      if (house.model || true) {
        new GLTFLoader().load(
          house.model || "/models/nordic-24.glb",
          (g) => {
            houseTemplate = g.scene;
          },
          undefined,
          () => {}
        );
      }

      const cellCenter = (i: number, j: number): [number, number] => [-HALF + (i + 0.5) * CELL, -HALF + (j + 0.5) * CELL];

      const footprint = (t: ToolDef) => (curRot % 2 === 1 ? { fw: t.fd, fd: t.fw } : { fw: t.fw, fd: t.fd });

      const cellsFor = (i0: number, j0: number, fw: number, fd: number): [number, number][] | null => {
        const ci = Math.min(Math.max(i0, 0), N - fw);
        const cj = Math.min(Math.max(j0, 0), N - fd);
        const cells: [number, number][] = [];
        for (let a = 0; a < fw; a++) for (let b = 0; b < fd; b++) cells.push([ci + a, cj + b]);
        return cells;
      };

      const hasType = (t: ToolKey) => [...objects.values()].some((o) => o.type === t);
      const objAt = (i: number, j: number) => (occupied[i]?.[j] != null ? objects.get(occupied[i][j]!) : undefined);

      // 배치 가능 검사 (사유 메시지 포함)
      const canPlace = (t: ToolKey, cells: [number, number][]): { ok: boolean; why?: string } => {
        if (t === "grade") {
          const [[i, j]] = cells;
          if (occupied[i][j] != null) return { ok: false, why: "설치물이 있는 칸은 정지할 수 없어요" };
          if (graded[i][j]) return { ok: false };
          return { ok: true };
        }
        if (t === "demolish") return { ok: true };
        for (const [i, j] of cells) {
          if (t === "house") {
            const o = objAt(i, j);
            if (!o || o.type !== "foundation") return { ok: false, why: "주택은 기초 위에만 앉힐 수 있어요 — 먼저 기초공사!" };
          } else if (occupied[i][j] != null) return { ok: false, why: "이미 설치물이 있는 자리예요" };
        }
        if (t === "foundation") {
          if (hasType("foundation")) return { ok: false, why: "기초는 하나만 시공할 수 있어요 (MVP)" };
          for (const [i, j] of cells) if (!graded[i][j]) return { ok: false, why: "기초는 정지작업된 땅 위에만! 🚜 먼저 땅을 고르세요" };
        }
        if (t === "house" && hasType("house")) return { ok: false, why: "주택은 하나만 설치할 수 있어요 (MVP)" };
        if (t === "tree") {
          const [[i, j]] = cells;
          if (graded[i][j]) return { ok: false, why: "나무는 잔디 위에만 심을 수 있어요" };
        }
        if (t === "deck") {
          if (!hasType("house")) return { ok: false, why: "데크는 주택이 있어야 붙일 수 있어요" };
          const houseObj = [...objects.values()].find((o) => o.type === "house")!;
          const hs = new Set(houseObj.cells.map(([a, b]) => `${a},${b}`));
          const touches = cells.some(([i, j]) =>
            [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].some(([a, b]) => hs.has(`${a},${b}`))
          );
          if (!touches) return { ok: false, why: "데크는 주택에 붙여서 설치하세요" };
        }
        return { ok: true };
      };

      /* ---------- 오브젝트 생성 ---------- */
      const tree = (s = 1) => {
        const g = new THREE.Group();
        g.add(box(0.16 * s, 0.6 * s, 0.16 * s, "#6b4a2e", [0, 0.3 * s, 0]));
        const cm = mat("#4f7a3f", { rough: 0.92 });
        ([[0, 0.95, 0, 0.5], [0.22, 0.8, 0.1, 0.34], [-0.2, 0.9, -0.14, 0.36]] as const).forEach(([x, y, z, r]) => {
          const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), cm);
          f.position.set(x * s, y * s, z * s);
          f.castShadow = true;
          f.receiveShadow = true;
          g.add(f);
        });
        return g;
      };

      const buildObject = (t: ToolDef, cells: [number, number][]): THREE_NS.Object3D => {
        const is1 = cells.length === 1;
        const [ci, cj] = cells[0];
        const iMax = Math.max(...cells.map((c) => c[0]));
        const jMax = Math.max(...cells.map((c) => c[1]));
        const [x0, z0] = cellCenter(ci, cj);
        const [x1, z1] = cellCenter(iMax, jMax);
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const w = (iMax - ci + 1) * CELL;
        const d = (jMax - cj + 1) * CELL;
        const g = new THREE.Group();
        g.position.set(cx, 0, cz);

        if (t.key === "foundation") {
          g.add(box(w - 0.06, 0.35, d - 0.06, "#cfcabf", [0, 0.175, 0], { rough: 0.9, map: concTex }));
        } else if (t.key === "house") {
          const targetW = w - 0.12;
          const targetD = d - 0.12;
          if (houseTemplate) {
            const m = houseTemplate.clone(true);
            const b = new THREE.Box3().setFromObject(m);
            const size = b.getSize(new THREE.Vector3());
            const s = Math.min(targetW / size.x, targetD / size.z);
            m.scale.setScalar(s);
            const b2 = new THREE.Box3().setFromObject(m);
            const c = b2.getCenter(new THREE.Vector3());
            m.position.set(-c.x, 0.35 - b2.min.y, -c.z);
            if (curRot % 2 === 1) {
              // 회전 배치: 모델을 90도 돌려 footprint에 맞춤
              m.rotation.y = Math.PI / 2;
              const b3 = new THREE.Box3().setFromObject(m);
              const s2 = Math.min(targetW / (b3.max.x - b3.min.x), targetD / (b3.max.z - b3.min.z));
              m.scale.multiplyScalar(s2);
              const b4 = new THREE.Box3().setFromObject(m);
              const c4 = b4.getCenter(new THREE.Vector3());
              m.position.x -= c4.x;
              m.position.z -= c4.z;
              m.position.y += 0.35 - b4.min.y;
            }
            m.traverse((o) => {
              const mm = o as THREE_NS.Mesh;
              if (mm.isMesh) {
                mm.castShadow = true;
                mm.receiveShadow = true;
              }
            });
            g.add(m);
          } else {
            g.add(box(targetW, 1.3, targetD, house.color, [0, 0.35 + 0.65, 0], { rough: 0.8 }));
            g.add(box(targetW + 0.15, 0.16, targetD + 0.15, "#3a3f45", [0, 1.78, 0], { rough: 0.7 }));
          }
        } else if (t.key === "deck") {
          const planks = Math.max(3, Math.round((Math.max(w, d) / 0.16)));
          const along = w >= d;
          for (let k = 0; k < planks; k++) {
            const off = -Math.max(w, d) / 2 + (k + 0.5) * (Math.max(w, d) / planks);
            g.add(
              box(
                along ? Math.max(w, d) / planks - 0.02 : Math.min(w, d) - 0.06,
                0.12,
                along ? Math.min(w, d) - 0.06 : Math.max(w, d) / planks - 0.02,
                k % 2 ? "#a9855c" : "#a07c53",
                [along ? off : 0, 0.12, along ? 0 : off],
                { rough: 0.85 }
              )
            );
          }
        } else if (t.key === "tree" && is1) {
          g.add(tree(0.95));
        } else if (t.key === "lamp" && is1) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.42, 8), mat("#3c4046", { rough: 0.5, metal: 0.4 }));
          pole.position.y = 0.21;
          pole.castShadow = true;
          g.add(pole);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat("#ffd9a0", { emissive: "#ffbe66", emi: 1.3, rough: 0.3 }));
          bulb.position.y = 0.46;
          g.add(bulb);
        }
        return g;
      };

      /* ---------- 고스트 프리뷰 ---------- */
      const ghostMat = new THREE.MeshStandardMaterial({ color: 0x2f7d5b, transparent: true, opacity: 0.4, roughness: 0.6 });
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
      ghost.visible = false;
      scene.add(ghost);

      /* ---------- 비용 동기화 ---------- */
      const syncCost = () => {
        const gradedCount = graded.flat().filter(Boolean).length;
        const list: CostItem[] = [];
        if (gradedCount) list.push({ label: `정지작업 ${gradedCount}칸`, amount: gradedCount * 300_000 });
        const counts: Partial<Record<ToolKey, number>> = {};
        objects.forEach((o) => (counts[o.type] = (counts[o.type] || 0) + 1));
        if (counts.foundation) list.push({ label: "기초공사", amount: 8_000_000 });
        if (counts.house) list.push({ label: `${house.name} 시공`, amount: house.priceKRW });
        if (counts.deck) list.push({ label: `데크 ×${counts.deck}`, amount: counts.deck * 1_800_000 });
        if (counts.tree) list.push({ label: `조경수 ×${counts.tree}`, amount: counts.tree * 150_000 });
        if (counts.lamp) list.push({ label: `정원등 ×${counts.lamp}`, amount: counts.lamp * 80_000 });
        setItems(list);
      };

      /* ---------- 배치/철거 ---------- */
      const place = (i: number, j: number) => {
        const t = TOOLS.find((x) => x.key === curTool)!;
        if (curTool === "demolish") {
          const o = objAt(i, j);
          if (o) {
            if (o.type === "foundation" && hasType("house")) {
              setHint("주택을 먼저 철거해야 기초를 제거할 수 있어요");
              return;
            }
            o.cells.forEach(([a, b]) => (occupied[a][b] = null));
            scene.remove(o.group);
            objects.delete(o.id);
            syncCost();
            setHint(`${TOOLS.find((x) => x.key === o.type)?.label} 철거 완료`);
          } else if (graded[i][j]) {
            graded[i][j] = false;
            if (gradeTiles[i][j]) {
              scene.remove(gradeTiles[i][j]!);
              gradeTiles[i][j] = null;
            }
            syncCost();
          }
          return;
        }
        const { fw, fd } = footprint(t);
        const cells = cellsFor(i, j, fw, fd)!;
        const chk = canPlace(curTool, cells);
        if (!chk.ok) {
          if (chk.why) setHint(`⚠️ ${chk.why}`);
          return;
        }
        if (curTool === "grade") {
          graded[i][j] = true;
          const [x, z] = cellCenter(i, j);
          const tile = new THREE.Mesh(new THREE.BoxGeometry(CELL - 0.03, 0.05, CELL - 0.03), mat("#b5946a", { rough: 1, map: dirtTex }));
          tile.position.set(x, 0.026, z);
          tile.receiveShadow = true;
          scene.add(tile);
          gradeTiles[i][j] = tile;
          syncCost();
          return;
        }
        const id = nextId++;
        const group = buildObject(t, cells);
        scene.add(group);
        cells.forEach(([a, b]) => (occupied[a][b] = id));
        objects.set(id, { id, type: curTool, cells, group });
        syncCost();
        setHint(`${t.label} 설치 완료! ${t.key === "foundation" ? "이제 주택을 앉혀보세요 🏠" : t.key === "house" ? "데크·조경으로 마무리해보세요 🪵" : ""}`);
      };

      /* ---------- 포인터 ---------- */
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      let isDown = false;
      let downXY = [0, 0];

      const pickCell = (ev: PointerEvent): [number, number] | null => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const pt = new THREE.Vector3();
        if (!ray.ray.intersectPlane(groundPlane, pt)) return null;
        const i = Math.floor((pt.x + HALF) / CELL);
        const j = Math.floor((pt.z + HALF) / CELL);
        if (i < 0 || j < 0 || i >= N || j >= N) return null;
        return [i, j];
      };

      const updateGhost = (ev: PointerEvent) => {
        const cell = pickCell(ev);
        if (!cell) {
          ghost.visible = false;
          return;
        }
        const t = TOOLS.find((x) => x.key === curTool)!;
        const { fw, fd } = footprint(t);
        const cells = cellsFor(cell[0], cell[1], fw, fd)!;
        const iMin = Math.min(...cells.map((c) => c[0]));
        const jMin = Math.min(...cells.map((c) => c[1]));
        const [x0, z0] = cellCenter(iMin, jMin);
        const iMax = Math.max(...cells.map((c) => c[0]));
        const jMax = Math.max(...cells.map((c) => c[1]));
        const [x1, z1] = cellCenter(iMax, jMax);
        const chk = canPlace(curTool, cells);
        ghost.scale.set(fw * CELL - 0.05, Math.max(0.04, t.h), fd * CELL - 0.05);
        ghost.position.set((x0 + x1) / 2, Math.max(0.04, t.h) / 2 + (curTool === "house" ? 0.35 : 0.01), (z0 + z1) / 2);
        ghostMat.color.set(curTool === "demolish" ? 0xd97706 : chk.ok ? 0x2f7d5b : 0xdc2626);
        ghost.visible = true;
      };

      const onMove = (ev: PointerEvent) => {
        updateGhost(ev);
        if (isDown && curTool === "grade") {
          const cell = pickCell(ev);
          if (cell) place(cell[0], cell[1]);
        }
      };
      const onDown = (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        isDown = true;
        downXY = [ev.clientX, ev.clientY];
        if (curTool === "grade") {
          const cell = pickCell(ev);
          if (cell) place(cell[0], cell[1]);
        }
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        const moved = Math.hypot(ev.clientX - downXY[0], ev.clientY - downXY[1]);
        isDown = false;
        if (curTool !== "grade" && moved < 6) {
          const cell = pickCell(ev);
          if (cell) place(cell[0], cell[1]);
        }
      };
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("pointerleave", () => (ghost.visible = false));

      const onKey = (e: KeyboardEvent) => {
        if (e.key === "r" || e.key === "R" || e.key === "ㄱ") setRot((v) => (v + 1) % 2);
      };
      window.addEventListener("keydown", onKey);

      /* ---------- 후처리 ---------- */
      const composer = new EffectComposer(renderer);
      composer.setPixelRatio(DPR);
      composer.setSize(W, H);
      composer.addPass(new RenderPass(scene, camera));
      const ssao = new SSAOPass(scene, camera, W, H);
      ssao.kernelRadius = 0.55;
      ssao.minDistance = 0.0015;
      ssao.maxDistance = 0.08;
      composer.addPass(ssao);
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.22, 0.5, 0.9));
      composer.addPass(new OutputPass());
      composer.addPass(new SMAAPass(W * DPR, H * DPR));

      const ro = new ResizeObserver(() => {
        const w = mount.clientWidth, h = mount.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        composer.setSize(w, h);
      });
      ro.observe(mount);

      renderer.setAnimationLoop(() => {
        controls.update();
        composer.render();
      });

      apiRef.current = {
        setTool: (t, r) => {
          curTool = t;
          curRot = r;
          ghost.visible = false;
        },
        reset: () => {
          objects.forEach((o) => scene.remove(o.group));
          objects.clear();
          for (let i = 0; i < N; i++)
            for (let j = 0; j < N; j++) {
              occupied[i][j] = null;
              if (gradeTiles[i][j]) {
                scene.remove(gradeTiles[i][j]!);
                gradeTiles[i][j] = null;
              }
              graded[i][j] = false;
            }
          syncCost();
          setHint("초기화 완료 — 다시 지어보세요!");
        },
        dispose: () => {
          renderer.setAnimationLoop(null);
          ro.disconnect();
          window.removeEventListener("keydown", onKey);
          controls.dispose();
          pmrem.dispose();
          scene.traverse((obj) => {
            const m = obj as THREE_NS.Mesh;
            m.geometry?.dispose?.();
            const mm = m.material as THREE_NS.Material | THREE_NS.Material[] | undefined;
            if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
            else mm?.dispose?.();
          });
          renderer.dispose();
          if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
        },
      };
      setReady(true);
    })();

    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/land/${land.id}`} className="text-sm font-medium text-foreground/50 hover:text-brand">
            ← 매물로 돌아가기
          </Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            직접 짓기 <span className="rounded-full bg-brand/10 px-2 py-0.5 align-middle text-xs font-bold text-brand">BETA</span>
          </h1>
          <p className="text-sm text-foreground/50">
            {land.region} · {land.title} ({land.areaPy}평)
          </p>
        </div>
        <button
          onClick={() => apiRef.current?.reset()}
          className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold transition hover:bg-sand"
        >
          ♻️ 초기화
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_290px]">
        {/* 3D 캔버스 + 툴바 */}
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="relative">
            <div ref={mountRef} className="h-[380px] w-full sm:h-[480px]" style={{ background: "linear-gradient(#dceaf3,#eef5f0)", cursor: "crosshair" }} />
            {!ready && (
              <div className="absolute inset-0 grid place-items-center text-sm text-foreground/40">3D 현장 준비 중…</div>
            )}
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur">
              {hint}
            </div>
            <div className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-foreground/45">
              좌클릭 배치 · 우클릭 드래그 회전 · R 배치회전
            </div>
          </div>
          {/* 툴바 */}
          <div className="flex gap-1.5 overflow-x-auto border-t border-black/5 px-3 py-2.5">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setToolState(t.key);
                }}
                title={t.desc}
                className={`flex min-w-[76px] flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-center transition ${
                  tool === t.key ? "bg-brand text-white shadow" : "bg-sand text-foreground/70 hover:bg-black/5"
                }`}
              >
                <span className="text-xl leading-none">{t.icon}</span>
                <span className="text-[11px] font-bold">{t.label}</span>
                <span className={`text-[10px] ${tool === t.key ? "text-white/70" : "text-foreground/40"}`}>
                  {t.key === "house" ? eok(house.priceKRW) : t.price ? `${won(t.price / 10000)}만` : "-"}
                </span>
              </button>
            ))}
          </div>
          <p className="border-t border-black/5 px-4 py-2 text-center text-[11px] text-foreground/45">
            {TOOLS.find((t) => t.key === tool)?.desc}
          </p>
        </div>

        {/* 비용 패널 */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold">실시간 견적</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between text-foreground/60">
                <dt>대지 매입 ({land.areaPy}평)</dt>
                <dd className="font-semibold text-foreground">{won(landPrice)}원</dd>
              </div>
              {items.map((it) => (
                <div key={it.label} className="flex justify-between text-foreground/60">
                  <dt>{it.label}</dt>
                  <dd className="font-semibold text-foreground">{won(it.amount)}원</dd>
                </div>
              ))}
              {items.length === 0 && <p className="text-xs text-foreground/35">아직 시공 항목이 없습니다 — 땅부터 골라보세요!</p>}
              <div className="border-t border-dashed border-black/10 pt-2">
                <div className="flex justify-between text-base">
                  <dt className="font-bold">합계</dt>
                  <dd className="font-black text-brand">{eok(total)}</dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl bg-brand p-4 text-white">
            {sent ? (
              <div className="text-center text-sm">
                <p className="text-xl">✅</p>
                <p className="mt-1 font-bold">내 구성이 접수되었습니다</p>
                <p className="mt-1 text-white/80">담당 매니저가 이 구성 그대로 견적 상담을 도와드립니다.</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold">마음에 드는 구성이 완성됐나요?</p>
                <p className="mt-1 text-xs text-white/80">지금 화면의 배치·견적 그대로 상담을 신청할 수 있어요.</p>
                <button onClick={() => setSent(true)} className="mt-3 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-brand transition hover:bg-white/90">
                  이 구성으로 상담 신청 →
                </button>
              </>
            )}
          </div>

          <div className="rounded-2xl bg-sand p-4 text-xs leading-relaxed text-foreground/55">
            <p className="font-bold text-foreground/70">🎮 플레이 방법</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>🚜 정지작업으로 땅을 드래그해 고르고</li>
              <li>🧱 기초를 그 위에 놓은 뒤</li>
              <li>🏠 주택을 기초 위에 앉히고</li>
              <li>🪵 데크·🌳 조경수·💡 정원등으로 마무리!</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
