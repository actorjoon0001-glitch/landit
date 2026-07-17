"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREE_NS from "three";
import type { Land, ModularHouse } from "@/lib/data";

/* ------------------------------------------------------------------ *
 * 실시간 3D 시공 시뮬레이션 (Three.js)
 * 환경광(IBL) · 태양광 그림자 · 앰비언트 오클루전(SSAO) · 블룸 · SMAA ·
 * 절차적 텍스처(잔디/콘크리트/아스팔트). 드래그 회전.
 * ------------------------------------------------------------------ */

const STAGES = [
  { key: "raw", label: "나대지", desc: "매물로 나온 원지반 상태" },
  { key: "civil", label: "토목공사", desc: "부지 정지·옹벽·굴착 작업" },
  { key: "found", label: "기초공사", desc: "콘크리트 기초 타설" },
  { key: "house", label: "주택 설치", desc: "이동식 모듈러 주택 앉힘" },
  { key: "finish", label: "포치·데크", desc: "데크·포치·조경 마감" },
];

type Api = {
  setStage: (n: number) => void;
  rebuildHouse: (h: ModularHouse) => void;
  dispose: () => void;
};

export default function Simulation({ land, house }: { land: Land; house: ModularHouse }) {
  const [stage, setStage] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");
      const mount = mountRef.current;
      if (disposed || !mount) return;

      const W = mount.clientWidth || 600;
      const H = mount.clientHeight || 380;
      const DPR = Math.min(window.devicePixelRatio, 2);

      /* ---------- 절차적 텍스처 ---------- */
      const canvasTex = (
        draw: (ctx: CanvasRenderingContext2D, s: number) => void,
        repeat: number,
        srgb = true
      ) => {
        const s = 256;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const ctx = c.getContext("2d")!;
        draw(ctx, s);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const grain = (ctx: CanvasRenderingContext2D, s: number, base: string, amp: number) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, s, s);
        const img = ctx.getImageData(0, 0, s, s);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const n = (Math.random() - 0.5) * amp;
          d[i] += n;
          d[i + 1] += n;
          d[i + 2] += n;
        }
        ctx.putImageData(img, 0, 0);
      };
      const grassTex = canvasTex((ctx, s) => {
        grain(ctx, s, "#6f9a52", 26);
        for (let i = 0; i < 900; i++) {
          ctx.strokeStyle = `rgba(${60 + Math.random() * 40},${100 + Math.random() * 50},${50 + Math.random() * 30},0.5)`;
          const x = Math.random() * s, y = Math.random() * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 3);
          ctx.stroke();
        }
      }, 5);
      const dirtTex = canvasTex((ctx, s) => grain(ctx, s, "#ac8a60", 24), 4);
      const concreteTex = canvasTex((ctx, s) => grain(ctx, s, "#cbc6bb", 12), 3);
      const roofTex = canvasTex((ctx, s) => {
        grain(ctx, s, "#454b54", 10);
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        for (let y = 8; y < s; y += 16) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(s, y);
          ctx.stroke();
        }
      }, 3);
      const asphaltTex = canvasTex((ctx, s) => {
        grain(ctx, s, "#3b3e44", 14);
        ctx.fillStyle = "rgba(220,210,180,0.85)";
        ctx.fillRect(s / 2 - 3, 0, 6, s * 0.32);
        ctx.fillRect(s / 2 - 3, s * 0.5, 6, s * 0.32);
      }, 1);

      /* ---------- 렌더러 / 씬 / 카메라 ---------- */
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#cfe3f0");
      scene.fog = new THREE.Fog("#cfe3f0", 24, 52);

      const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
      camera.position.set(6.6, 5.2, 7.2);

      const renderer = new THREE.WebGLRenderer({ antialias: false });
      renderer.setPixelRatio(DPR);
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      mount.appendChild(renderer.domElement);

      // 환경광(IBL) — 부드러운 실내 환경으로 앰비언트/반사
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.32;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.7, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 7;
      controls.maxDistance = 22;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = 1.36;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;
      controls.addEventListener("start", () => (controls.autoRotate = false));

      const hemi = new THREE.HemisphereLight(0xdcefff, 0x5f5238, 0.32);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff3dc, 2.7);
      sun.position.set(7, 11, 5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(4096, 4096);
      sun.shadow.camera.left = -8;
      sun.shadow.camera.right = 8;
      sun.shadow.camera.top = 8;
      sun.shadow.camera.bottom = -8;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 36;
      sun.shadow.bias = -0.0003;
      sun.shadow.normalBias = 0.03;
      scene.add(sun);

      /* ---------- 지오메트리 헬퍼 ---------- */
      const mat = (
        color: string,
        o: { rough?: number; metal?: number; flat?: boolean; emissive?: string; emi?: number; map?: THREE_NS.Texture } = {}
      ) =>
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: o.rough ?? 0.85,
          metalness: o.metal ?? 0,
          flatShading: o.flat ?? false,
          map: o.map,
          emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color(0x000000),
          emissiveIntensity: o.emi ?? 0,
        });
      const box = (
        w: number, h: number, d: number, color: string,
        pos: [number, number, number], o: Parameters<typeof mat>[1] & { cast?: boolean; recv?: boolean } = {}
      ) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
        m.position.set(pos[0], pos[1], pos[2]);
        m.castShadow = o.cast ?? true;
        m.receiveShadow = o.recv ?? true;
        return m;
      };

      const scene_ = scene;
      const PLOT = 6;

      // 원경 지면 + 대지
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), mat("#688750", { rough: 1, map: grassTex }));
      (outer.material.map as THREE_NS.Texture).repeat.set(30, 30);
      outer.rotation.x = -Math.PI / 2;
      outer.position.y = -0.02;
      outer.receiveShadow = true;
      scene_.add(outer);

      const plot = box(PLOT, 0.26, PLOT, "#6f9a52", [0, -0.13, 0], { rough: 1, map: grassTex, cast: false });
      scene_.add(plot);
      scene_.add(box(PLOT - 0.1, 0.7, PLOT - 0.1, "#6b4f34", [0, -0.55, 0], { rough: 1, map: dirtTex, cast: false }));

      // 스테이지 그룹
      const groups: Record<string, THREE_NS.Group> = {};
      const mkGroup = (key: string) => {
        const g = new THREE.Group();
        g.visible = false;
        g.userData.rt = 0;
        g.userData.shown = false;
        scene_.add(g);
        groups[key] = g;
        return g;
      };
      const g0 = mkGroup("g0");
      const g1 = mkGroup("g1");
      const gExcav = mkGroup("gExcav");
      const g2 = mkGroup("g2");
      const gFound = mkGroup("gFound"); // 기초 단계 전용(거푸집·철근)
      const g3 = mkGroup("g3");
      const g4 = mkGroup("g4");

      const tree = (x: number, z: number, s = 1) => {
        const g = new THREE.Group();
        g.add(box(0.22 * s, 0.8 * s, 0.22 * s, "#6b4a2e", [0, 0.4 * s, 0], { rough: 1 }));
        const canopyMat = mat("#4f7a3f", { rough: 0.92 });
        const blobs: [number, number, number, number][] = [
          [0, 1.2 * s, 0, 0.72 * s],
          [0.35 * s, 1.05 * s, 0.15 * s, 0.5 * s],
          [-0.3 * s, 1.15 * s, -0.2 * s, 0.52 * s],
          [0.1 * s, 1.5 * s, -0.1 * s, 0.48 * s],
        ];
        blobs.forEach(([bx, by, bz, r]) => {
          const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), canopyMat);
          f.position.set(bx, by, bz);
          f.castShadow = true;
          f.receiveShadow = true;
          g.add(f);
        });
        g.position.set(x, 0, z);
        return g;
      };

      // 0. 나대지 — 수목·덤불·풀숲·야생화·바위가 있는 자연 상태
      g0.add(tree(-1.4, 1.0, 1.05));
      g0.add(tree(1.2, -0.6, 0.9));
      g0.add(tree(-0.6, -1.6, 1.0));
      g0.add(tree(2.0, 1.6, 0.7));
      {
        const rockMat = mat("#9a948a", { flat: true, rough: 1 });
        ([[1.4, 1.2, 0.35], [-2.1, -0.9, 0.24], [0.3, 2.2, 0.18]] as const).forEach(([x, z, r], i) => {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
          rock.position.set(x, r * 0.55, z);
          rock.rotation.y = i * 1.3;
          rock.castShadow = true;
          rock.receiveShadow = true;
          g0.add(rock);
        });
        // 풀숲(억새) — 가는 원뿔 다발
        const gMat1 = mat("#7d9c55", { rough: 1 });
        const gMat2 = mat("#93a95e", { rough: 1 });
        for (let i = 0; i < 34; i++) {
          const a = (i / 34) * Math.PI * 2;
          const rr = 1.0 + ((i * 7919) % 100) / 100 * 1.7;
          const gx = Math.cos(a) * rr;
          const gz = Math.sin(a) * rr;
          const h = 0.22 + ((i * 104729) % 100) / 100 * 0.3;
          const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, h, 5), i % 2 ? gMat1 : gMat2);
          tuft.position.set(gx, h / 2, gz);
          tuft.rotation.z = (((i * 31) % 10) - 5) * 0.03;
          tuft.castShadow = true;
          g0.add(tuft);
        }
        // 덤불
        const bushMat = mat("#5c8046", { flat: true, rough: 1 });
        ([[-0.4, 0.6, 0.3], [1.8, -1.6, 0.26], [-1.9, 2.0, 0.34]] as const).forEach(([x, z, r]) => {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), bushMat);
          b.position.set(x, r * 0.8, z);
          b.scale.y = 0.75;
          b.castShadow = true;
          b.receiveShadow = true;
          g0.add(b);
        });
        // 야생화 점점이
        const petal = [mat("#e9d16c", { rough: 0.8 }), mat("#e0e6ef", { rough: 0.8 })];
        for (let i = 0; i < 12; i++) {
          const fx = Math.cos(i * 2.4) * (0.6 + (i % 5) * 0.35);
          const fz = Math.sin(i * 2.4) * (0.6 + ((i + 2) % 5) * 0.35);
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), petal[i % 2]);
          f.position.set(fx, 0.14, fz);
          g0.add(f);
        }
      }

      // 1. 토목 — 정지 패드·옹벽·측량말뚝·수평줄·타이어자국·안전고깔·자갈
      g1.add(box(4, 0.14, 4, "#b5946a", [0, 0.07, 0], { rough: 1, map: dirtTex, cast: false }));
      g1.add(box(4.2, 0.58, 0.24, "#c2bdb0", [0, 0.29, 2.95], { rough: 0.95, map: concreteTex }));
      const pile = (x: number, z: number, h: number) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.7, h, 8), mat("#a8875c", { flat: true, rough: 1, map: dirtTex }));
        c.position.set(x, h / 2, z);
        c.castShadow = true;
        c.receiveShadow = true;
        return c;
      };
      g1.add(pile(-2.6, -0.4, 0.9));
      g1.add(pile(2.7, -1.0, 0.75));
      {
        // 측량 말뚝(모서리 4개) + 형광 수평줄
        const stakeMat = mat("#c8a06a", { rough: 0.9 });
        const capMat = mat("#ff5a3c", { rough: 0.6, emissive: "#ff5a3c", emi: 0.25 });
        const corners: [number, number][] = [[-2, -2], [2, -2], [2, 2], [-2, 2]];
        corners.forEach(([sx, sz]) => {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.5, 6), stakeMat);
          st.position.set(sx, 0.32, sz);
          st.castShadow = true;
          g1.add(st);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 6), capMat);
          cap.position.set(sx, 0.58, sz);
          g1.add(cap);
        });
        const lineMat = mat("#ffd166", { rough: 0.5, emissive: "#ffd166", emi: 0.35 });
        for (let i = 0; i < 4; i++) {
          const [ax, az] = corners[i];
          const [bx, bz] = corners[(i + 1) % 4];
          const len = Math.hypot(bx - ax, bz - az);
          const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.012), lineMat);
          line.position.set((ax + bx) / 2, 0.5, (az + bz) / 2);
          line.rotation.y = Math.atan2(az - bz, bx - ax);
          g1.add(line);
        }
        // 타이어 자국(궤도 흔적)
        const trackMat = mat("#8a6f4d", { rough: 1 });
        [-0.35, 0.35].forEach((off) => {
          const tr = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 3.4), trackMat);
          tr.rotation.x = -Math.PI / 2;
          tr.rotation.z = 0.35;
          tr.position.set(0.35 + off * Math.cos(0.35), 0.145, 0.15 + off * Math.sin(-0.35));
          tr.receiveShadow = true;
          g1.add(tr);
        });
        // 안전 고깔
        const coneMat = mat("#ff6a2a", { rough: 0.55 });
        const bandMat = mat("#ffffff", { rough: 0.4, emissive: "#ffffff", emi: 0.1 });
        ([[-1.6, 2.55], [1.7, 2.55]] as const).forEach(([cx, cz]) => {
          const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), coneMat);
          base.position.set(cx, 0.155, cz);
          g1.add(base);
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 10), coneMat);
          cone.position.set(cx, 0.31, cz);
          cone.castShadow = true;
          g1.add(cone);
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.05, 10), bandMat);
          band.position.set(cx, 0.31, cz);
          g1.add(band);
        });
        // 자갈 더미
        const gravel = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.34, 9), mat("#9d9890", { flat: true, rough: 1, map: concreteTex }));
        gravel.position.set(-2.5, 0.17, 1.6);
        gravel.castShadow = true;
        gravel.receiveShadow = true;
        g1.add(gravel);
      }
      {
        const ex = new THREE.Group();
        ex.add(box(1.6, 0.32, 0.9, "#2f3237", [0, 0.16, 0], { rough: 0.6 }));
        ex.add(box(1.05, 0.55, 0.95, "#f2c12e", [0, 0.55, 0], { rough: 0.45, metal: 0.2 }));
        ex.add(box(0.62, 0.62, 0.72, "#e6b31f", [-0.15, 1.05, 0], { rough: 0.45, metal: 0.2 }));
        ex.add(box(0.06, 0.42, 0.6, "#bfe3f0", [0.17, 1.08, 0], { rough: 0.1, metal: 0.4, emissive: "#bfe3f0", emi: 0.06 }));
        const boom = box(1.2, 0.16, 0.16, "#f2c12e", [0.8, 0.62, 0], { rough: 0.45, metal: 0.2 });
        boom.rotation.z = -0.35;
        ex.add(boom);
        ex.add(box(0.36, 0.4, 0.44, "#c9971f", [1.5, 0.18, 0], { rough: 0.5, metal: 0.3 }));
        ex.position.set(0.3, 0, 0.2);
        ex.rotation.y = -0.5;
        gExcav.add(ex);
      }

      // 2. 기초 — 콘크리트 슬래브(상시) + 거푸집·철근·앵커볼트(기초 단계 전용)
      g2.add(box(4, 0.5, 4, "#cfcabf", [0, 0.25, 0], { rough: 0.9, map: concreteTex }));
      [-1.2, 0, 1.2].forEach((x) =>
        [-1.2, 1.2].forEach((z) => g2.add(box(0.28, 0.14, 0.28, "#b7b1a4", [x, 0.57, z], { rough: 0.9 })))
      );
      {
        // 목재 거푸집(슬래브 둘레 판재 + 지지 말뚝)
        const formMat = mat("#a5814f", { rough: 0.95 });
        const L = 4.16;
        ([[0, 2.09, 0], [0, -2.09, 0], [2.09, 0, Math.PI / 2], [-2.09, 0, Math.PI / 2]] as const).forEach(
          ([fx, fz, ry]) => {
            const board = new THREE.Mesh(new THREE.BoxGeometry(L, 0.6, 0.06), formMat);
            board.position.set(fx, 0.3, fz);
            board.rotation.y = ry;
            board.castShadow = true;
            board.receiveShadow = true;
            gFound.add(board);
          }
        );
        [-1.6, 0, 1.6].forEach((p) => {
          ([[p, 2.22], [p, -2.22], [2.22, p], [-2.22, p]] as const).forEach(([bx, bz]) => {
            const brace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), formMat);
            brace.position.set(bx, 0.25, bz);
            gFound.add(brace);
          });
        });
        // 철근 격자(슬래브 윗면)
        const rebarMat = mat("#7a4a35", { rough: 0.5, metal: 0.55 });
        for (let i = -3; i <= 3; i++) {
          const bar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.7, 6), rebarMat);
          bar1.rotation.z = Math.PI / 2;
          bar1.position.set(0, 0.53, i * 0.55);
          gFound.add(bar1);
          const bar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.7, 6), rebarMat);
          bar2.rotation.x = Math.PI / 2;
          bar2.position.set(i * 0.55, 0.53, 0);
          gFound.add(bar2);
        }
        // 앵커볼트
        const boltMat = mat("#c9c2b2", { rough: 0.35, metal: 0.8 });
        [-1.5, 1.5].forEach((bx) =>
          [-1.5, 1.5].forEach((bz) => {
            const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), boltMat);
            bolt.position.set(bx, 0.58, bz);
            gFound.add(bolt);
          })
        );
      }

      const clearGroup = (g: THREE_NS.Group) => {
        for (let i = g.children.length - 1; i >= 0; i--) {
          const c = g.children[i];
          g.remove(c);
          c.traverse((o) => {
            const m = o as THREE_NS.Mesh;
            m.geometry?.dispose?.();
            const mm = m.material as THREE_NS.Material | THREE_NS.Material[] | undefined;
            if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
            else mm?.dispose?.();
          });
        }
      };

      // GLB 로더 (사용자 홈플래너 모델용)
      const gltfLoader = new GLTFLoader();
      try {
        gltfLoader.setMeshoptDecoder(MeshoptDecoder);
      } catch {
        /* meshopt 선택사항 */
      }
      let houseToken = 0;

      // AI 굴착기 모델 — 로드 성공 시 절차적 굴착기를 대체(실패 시 그대로 유지)
      gltfLoader.load(
        "/models/excavator.glb",
        (gltf) => {
          const obj = gltf.scene;
          const b0 = new THREE.Box3().setFromObject(obj);
          const size = b0.getSize(new THREE.Vector3());
          const s = 2.0 / Math.max(size.x, size.z || 0.001);
          obj.scale.setScalar(s);
          const b1 = new THREE.Box3().setFromObject(obj);
          const c = b1.getCenter(new THREE.Vector3());
          obj.position.set(-c.x, -b1.min.y + 0.14, -c.z);
          obj.traverse((o) => {
            const m = o as THREE_NS.Mesh;
            if (m.isMesh) {
              m.castShadow = true;
              m.receiveShadow = true;
            }
          });
          const wrap = new THREE.Group();
          wrap.add(obj);
          wrap.position.set(0.35, 0, 0.2);
          wrap.rotation.y = -0.6;
          clearGroup(gExcav);
          gExcav.add(wrap);
        },
        undefined,
        () => {
          /* 모델 없으면 절차적 굴착기 유지 */
        }
      );

      const dimsOf = (h: ModularHouse) => ({
        hw: Math.min(3.6, 2.6 + h.areaPy / 24),
        hd: Math.min(3.0, 2.0 + h.areaPy / 40),
        slabTop: 0.5,
        wallH: 1.5,
        wallTop: 2.0,
      });

      // 사용자 GLB 모델을 기초 위에 정규화 배치
      const placeModel = (obj: THREE_NS.Object3D, d: ReturnType<typeof dimsOf>) => {
        const b0 = new THREE.Box3().setFromObject(obj);
        const size = b0.getSize(new THREE.Vector3());
        const target = Math.max(d.hw, d.hd);
        const s = target / Math.max(size.x, size.z || 0.001);
        obj.scale.setScalar(s);
        const b1 = new THREE.Box3().setFromObject(obj);
        const c = b1.getCenter(new THREE.Vector3());
        obj.position.x -= c.x;
        obj.position.z -= c.z;
        obj.position.y += d.slabTop - b1.min.y;
        obj.traverse((o) => {
          const m = o as THREE_NS.Mesh;
          if ((m as THREE_NS.Mesh).isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        g3.add(obj);
      };

      const buildProceduralHouse = (h: ModularHouse, d: ReturnType<typeof dimsOf>) => {
        const { hw, hd, slabTop, wallH, wallTop } = d;
        // 벽
        g3.add(box(hw, wallH, hd, h.color, [0, slabTop + wallH / 2, 0], { rough: 0.78 }));
        // 문 + 문틀
        g3.add(box(0.72, 1.08, 0.06, "#2c2b28", [0, slabTop + 0.54, hd / 2 + 0.015], { rough: 0.6 }));
        g3.add(box(0.6, 1.0, 0.08, "#5a4632", [0, slabTop + 0.5, hd / 2 + 0.03], { rough: 0.6 }));
        // 손잡이
        g3.add(box(0.05, 0.05, 0.05, "#d8c98f", [0.2, slabTop + 0.5, hd / 2 + 0.08], { rough: 0.3, metal: 0.8 }));
        // 창 + 창틀
        const glass = { rough: 0.08, metal: 0.2, emissive: "#cfeaf5", emi: 0.08 };
        const win = (x: number, z: number, w: number, d: number, faceX: boolean) => {
          const frameColor = "#eceae5";
          if (faceX) {
            g3.add(box(0.05, 0.62, d + 0.08, frameColor, [x, slabTop + 0.95, z], { rough: 0.7 }));
            g3.add(box(0.06, 0.55, d, "#bfe3f0", [x + 0.01, slabTop + 0.95, z], glass));
          } else {
            g3.add(box(w + 0.08, 0.62, 0.05, frameColor, [x, slabTop + 0.95, z], { rough: 0.7 }));
            g3.add(box(w, 0.55, 0.06, "#bfe3f0", [x, slabTop + 0.95, z + 0.01], glass));
          }
        };
        win(-hw / 4 - 0.1, hd / 2 + 0.02, 0.6, 0.6, false);
        win(hw / 4 + 0.1, hd / 2 + 0.02, 0.6, 0.6, false);
        win(hw / 2 + 0.02, -hd / 4, 0.6, 0.7, true);
        win(hw / 2 + 0.02, hd / 4, 0.6, 0.7, true);

        // 지붕
        const roofMat = mat("#454b54", { rough: 0.6, map: roofTex });
        if (h.roof === "flat") {
          const r = new THREE.Mesh(new THREE.BoxGeometry(hw + 0.3, 0.22, hd + 0.3), roofMat);
          r.position.set(0, wallTop + 0.11, 0);
          r.castShadow = true;
          r.receiveShadow = true;
          g3.add(r);
        } else {
          const rh = 1.0;
          const shape = new THREE.Shape();
          if (h.roof === "mono") {
            shape.moveTo(-hw / 2 - 0.15, 0);
            shape.lineTo(hw / 2 + 0.15, 0);
            shape.lineTo(hw / 2 + 0.15, rh);
            shape.lineTo(-hw / 2 - 0.15, rh * 0.15);
          } else {
            shape.moveTo(-hw / 2 - 0.2, 0);
            shape.lineTo(hw / 2 + 0.2, 0);
            shape.lineTo(0, rh);
          }
          shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, { depth: hd + 0.3, bevelEnabled: false });
          geo.translate(0, 0, -(hd + 0.3) / 2);
          const roof = new THREE.Mesh(geo, roofMat);
          roof.position.y = wallTop;
          roof.castShadow = true;
          roof.receiveShadow = true;
          g3.add(roof);
        }
      };

      const buildDeckLandscape = (h: ModularHouse, d: ReturnType<typeof dimsOf>) => {
        const { hw, hd, slabTop } = d;
        // 4. 데크/포치/조경 — 판재 데크·난간·야외가구·퍼걸러·정원등·울타리
        const deckX = hw / 2 + 0.75;
        // 데크: 낱장 판재(색 변주)로 조립
        const plankColors = ["#a9855c", "#a07c53", "#b18d63", "#9c7950"];
        const plankW = 0.17;
        const nPlanks = Math.floor(1.5 / plankW);
        for (let i = 0; i < nPlanks; i++) {
          const px = deckX - 0.75 + plankW / 2 + i * plankW;
          g4.add(box(plankW - 0.02, 0.14, hd, plankColors[i % plankColors.length], [px, slabTop - 0.07, 0], { rough: 0.85 }));
        }
        // 데크 하부 지지목
        g4.add(box(1.5, 0.1, 0.12, "#7c6242", [deckX, slabTop - 0.19, -hd / 2 + 0.15], { rough: 0.9 }));
        g4.add(box(1.5, 0.1, 0.12, "#7c6242", [deckX, slabTop - 0.19, hd / 2 - 0.15], { rough: 0.9 }));
        const railX = deckX + 0.72;
        for (let z = -hd / 2 + 0.1; z <= hd / 2; z += 0.5) g4.add(box(0.09, 0.5, 0.09, "#8a6b47", [railX, slabTop + 0.2, z], { rough: 0.85 }));
        g4.add(box(0.1, 0.08, hd, "#8a6b47", [railX, slabTop + 0.44, 0], { rough: 0.85 }));
        g4.add(box(0.1, 0.05, hd, "#8a6b47", [railX, slabTop + 0.22, 0], { rough: 0.85 }));
        g4.add(box(0.4, 0.16, 0.8, "#b9b3a6", [deckX + 0.55, slabTop - 0.18, hd / 2 + 0.2], { rough: 0.9, map: concreteTex }));
        g4.add(box(0.4, 0.16, 0.8, "#c3bdb0", [deckX + 0.9, slabTop - 0.34, hd / 2 + 0.2], { rough: 0.9, map: concreteTex }));
        // 야외 가구: 테이블 + 의자 2
        const furnWood = mat("#8f6f48", { rough: 0.8 });
        const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 14), furnWood);
        tableTop.position.set(deckX + 0.1, slabTop + 0.34, -hd / 2 + 0.55);
        tableTop.castShadow = true;
        g4.add(tableTop);
        const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), furnWood);
        tableLeg.position.set(deckX + 0.1, slabTop + 0.17, -hd / 2 + 0.55);
        g4.add(tableLeg);
        ([[-0.32, 0.1], [0.3, -0.14]] as const).forEach(([ox, oz]) => {
          g4.add(box(0.2, 0.05, 0.2, "#7c6242", [deckX + 0.1 + ox, slabTop + 0.18, -hd / 2 + 0.55 + oz], { rough: 0.8 }));
          g4.add(box(0.2, 0.22, 0.045, "#7c6242", [deckX + 0.1 + ox, slabTop + 0.3, -hd / 2 + 0.45 + oz], { rough: 0.8 }));
        });
        // 퍼걸러(데크 위 목재 프레임)
        const perg = mat("#8a6b47", { rough: 0.85 });
        [-hd / 2 + 0.12, hd / 2 - 0.12].forEach((pz) => {
          [deckX - 0.55, deckX + 0.6].forEach((px2) => {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), perg);
            post.position.set(px2, slabTop + 0.75, pz);
            post.castShadow = true;
            g4.add(post);
          });
        });
        [-hd / 2 + 0.12, hd / 2 - 0.12].forEach((pz) => {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.09), perg);
          beam.position.set(deckX + 0.02, slabTop + 1.52, pz);
          beam.castShadow = true;
          g4.add(beam);
        });
        for (let i = 0; i < 5; i++) {
          const slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, hd - 0.1), perg);
          slat.position.set(deckX - 0.5 + i * 0.26, slabTop + 1.58, 0);
          slat.castShadow = true;
          g4.add(slat);
        }
        // 정원등(진입 보도 옆, 따뜻한 발광)
        const lampPost = mat("#3c4046", { rough: 0.5, metal: 0.4 });
        const lampGlow = mat("#ffd9a0", { rough: 0.3, emissive: "#ffbe66", emi: 1.2 });
        for (let i = 0; i < 3; i++) {
          const lx = deckX + 1.05;
          const lz = hd / 2 + 0.75 + i * 0.6;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.4, 8), lampPost);
          pole.position.set(lx, 0.2, lz);
          g4.add(pole);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lampGlow);
          bulb.position.set(lx, 0.44, lz);
          g4.add(bulb);
        }
        // 낮은 목재 울타리(앞마당 경계, 진입로 구간은 개방)
        const fenceMat = mat("#a5814f", { rough: 0.9 });
        for (let fx = -2.8; fx <= 2.8; fx += 0.7) {
          if (fx > -2.2 && fx < -0.4) continue; // 진입로 개방부
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.07), fenceMat);
          post.position.set(fx, 0.21, 2.86);
          post.castShadow = true;
          g4.add(post);
        }
        [[-2.8, -2.2], [-0.4, 2.8]].forEach(([a, b]) => {
          const len = b - a;
          [0.14, 0.3].forEach((fy) => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.04), fenceMat);
            rail.position.set((a + b) / 2, fy, 2.86);
            g4.add(rail);
          });
        });
        // 현관 옆 화분
        const potMat = mat("#b0563e", { rough: 0.8 });
        ([[hw / 2 + 0.18, hd / 2 + 0.35], [-0.5, hd / 2 + 0.35]] as const).forEach(([px3, pz3]) => {
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.18, 10), potMat);
          pot.position.set(px3, 0.09 + slabTop - 0.5, pz3);
          pot.position.y = 0.09;
          pot.castShadow = true;
          g4.add(pot);
          const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), mat("#4e7d3e", { rough: 0.9 }));
          shrub.position.set(px3, 0.27, pz3);
          shrub.castShadow = true;
          g4.add(shrub);
        });

        // 진입로 (아스팔트)
        const drive = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.0), mat("#3b3e44", { rough: 0.7, map: asphaltTex }));
        drive.rotation.x = -Math.PI / 2;
        drive.position.set(-1.3, 0.02, 2.0);
        drive.receiveShadow = true;
        g4.add(drive);
        // 포치 진입 보도블럭
        for (let i = 0; i < 3; i++) {
          g4.add(box(0.55, 0.06, 0.55, i % 2 ? "#c9c3b6" : "#bdb7aa", [deckX + 1.35 + i * 0.0, 0.03, hd / 2 + 0.9 + i * 0.6], { rough: 0.9, map: concreteTex }));
        }

        // 조경수 · 관목
        g4.add(tree(-2.4, 1.9, 1.1));
        g4.add(tree(-2.5, -1.6, 1.0));
        g4.add(tree(2.6, 2.0, 0.95));
        [[-1.9, 2.4], [-1.4, 2.5], [2.2, -1.8]].forEach(([x, z]) => {
          const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), mat("#5c8a48", { rough: 0.9 }));
          bush.position.set(x, 0.32, z);
          bush.castShadow = true;
          bush.receiveShadow = true;
          g4.add(bush);
        });
        // 자동차
        const car = new THREE.Group();
        car.add(box(1.7, 0.36, 0.8, "#c9524a", [0, 0.36, 0], { rough: 0.25, metal: 0.6 }));
        car.add(box(0.95, 0.34, 0.72, "#d8615a", [-0.05, 0.64, 0], { rough: 0.2, metal: 0.6 }));
        car.add(box(0.5, 0.24, 0.66, "#bfe3f0", [0.12, 0.64, 0], { rough: 0.1, metal: 0.3 }));
        [[-0.55, 0.42], [-0.55, -0.42], [0.55, 0.42], [0.55, -0.42]].forEach(([x, z]) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 20), mat("#1c1f24", { rough: 0.7 }));
          w.rotation.x = Math.PI / 2;
          w.position.set(x, 0.17, z);
          w.castShadow = true;
          car.add(w);
        });
        car.position.set(-1.3, 0, 2.0);
        car.rotation.y = 0.02;
        g4.add(car);
      };

      const buildHouse = (h: ModularHouse) => {
        const d = dimsOf(h);
        clearGroup(g3);
        clearGroup(g4);
        buildDeckLandscape(h, d);
        const token = ++houseToken;
        if (h.model) {
          buildProceduralHouse(h, d); // GLB 로딩 중 임시 표시
          gltfLoader.load(
            h.model,
            (gltf) => {
              if (token !== houseToken) return;
              clearGroup(g3);
              placeModel(gltf.scene, d);
              g3.scale.y = g3.userData.shown ? 1 : 0.001;
            },
            undefined,
            () => {
              /* 로드 실패 시 절차적 버전 유지 */
            }
          );
        } else {
          buildProceduralHouse(h, d);
        }
      };
      buildHouse(house);

      const applyStage = (n: number) => {
        const set = (g: THREE_NS.Group, shown: boolean) => {
          if (shown && !g.userData.shown) {
            g.userData.shown = true;
            g.visible = true;
            g.userData.rt = 0.001;
          } else if (!shown) {
            g.userData.shown = false;
            g.visible = false;
            g.userData.rt = 0;
            g.scale.y = 1;
          }
        };
        set(g0, n === 0);
        set(g1, n >= 1);
        set(gExcav, n === 1);
        set(g2, n >= 2);
        set(gFound, n === 2);
        set(g3, n >= 3);
        set(g4, n >= 4);
      };

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
      const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.24, 0.5, 0.9);
      composer.addPass(bloom);
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

      const clock = new THREE.Clock();
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
      renderer.setAnimationLoop(() => {
        const dt = clock.getDelta();
        Object.values(groups).forEach((g) => {
          if (g.userData.shown && g.userData.rt < 1) {
            g.userData.rt = Math.min(1, g.userData.rt + dt * 2.4);
            g.scale.y = Math.max(0.001, easeOut(g.userData.rt));
          }
        });
        controls.update();
        composer.render();
      });

      apiRef.current = {
        setStage: applyStage,
        rebuildHouse: (h) => {
          buildHouse(h);
          g3.visible = g3.userData.shown;
          g4.visible = g4.userData.shown;
          g3.scale.y = g3.userData.shown ? 1 : 0.001;
          g4.scale.y = g4.userData.shown ? 1 : 0.001;
        },
        dispose: () => {
          renderer.setAnimationLoop(null);
          ro.disconnect();
          controls.dispose();
          composer.dispose?.();
          pmrem.dispose();
          scene.traverse((obj) => {
            const m = obj as THREE_NS.Mesh;
            m.geometry?.dispose?.();
            const mm = m.material as THREE_NS.Material | THREE_NS.Material[] | undefined;
            if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
            else mm?.dispose?.();
          });
          [grassTex, dirtTex, concreteTex, roofTex, asphaltTex].forEach((t) => t.dispose());
          renderer.dispose();
          if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
        },
      };
      applyStage(3);
      setReady(true);
    })();

    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.setStage(stage);
  }, [stage]);

  useEffect(() => {
    apiRef.current?.rebuildHouse(house);
  }, [house]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setStage((s) => {
        if (s >= STAGES.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 1200);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing]);

  const play = () => {
    if (stage >= STAGES.length - 1) setStage(0);
    setPlaying(true);
  };

  const fpRatio = Math.min(0.5, house.areaPy / land.areaPy);
  const won = (n: number) => new Intl.NumberFormat("ko-KR").format(Math.round(n));

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" />
          <span className="text-sm font-semibold">3D 시공 시뮬레이션</span>
          <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] font-medium text-foreground/60">
            {STAGES[stage].label}
          </span>
        </div>
        <button
          onClick={play}
          className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium transition hover:bg-sand"
        >
          {playing ? "■ 재생 중" : "▶ 시공 과정 재생"}
        </button>
      </div>

      <div className="relative">
        <div
          ref={mountRef}
          className="h-[300px] w-full sm:h-[380px]"
          style={{ background: "linear-gradient(#dceaf3,#eef5f0)", cursor: "grab" }}
          aria-label={`${land.title} 3D 시공 시뮬레이션`}
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-sm text-foreground/40">
            3D 장면 불러오는 중…
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-foreground/45">
          드래그하여 회전 · 스크롤 확대
        </div>
      </div>

      <div className="border-t border-black/5 px-4 py-3">
        <div className="flex items-center justify-between">
          {STAGES.map((s, i) => (
            <button
              key={s.key}
              onClick={() => {
                setPlaying(false);
                setStage(i);
              }}
              className="group flex flex-1 flex-col items-center gap-1.5"
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition ${
                  i <= stage ? "bg-brand text-white" : "bg-sand text-foreground/40"
                }`}
              >
                {i + 1}
              </span>
              <span className={`text-[10px] font-medium transition sm:text-[11px] ${i === stage ? "text-brand" : "text-foreground/45"}`}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand">
          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${(stage / (STAGES.length - 1)) * 100}%` }} />
        </div>
        <p className="mt-2 text-center text-xs text-foreground/50">{STAGES[stage].desc}</p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-black/5 border-t border-black/5 text-center">
        <Stat label="일조 점수" value={`${land.sunlight}/100`} />
        <Stat label="건폐 사용" value={`${Math.round(fpRatio * 100)}%`} />
        <Stat label="예상 시공" value={`${house.buildWeeks}주`} />
      </div>
      <div className="border-t border-black/5 px-4 py-2 text-center text-[11px] text-foreground/40">
        {house.name} · 시공비 약 {won(house.priceKRW / 10000)}만원 · {house.builder}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <div className="text-sm font-bold text-brand">{value}</div>
      <div className="mt-0.5 text-[11px] text-foreground/50">{label}</div>
    </div>
  );
}
