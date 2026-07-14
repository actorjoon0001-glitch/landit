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

      // 0. 나대지
      g0.add(tree(-1.4, 1.0, 1.05));
      g0.add(tree(1.2, -0.6, 0.9));
      g0.add(tree(-0.6, -1.6, 1.0));
      {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), mat("#9a948a", { flat: true, rough: 1 }));
        rock.position.set(1.4, 0.2, 1.2);
        rock.castShadow = true;
        rock.receiveShadow = true;
        g0.add(rock);
      }

      // 1. 토목
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

      // 2. 기초
      g2.add(box(4, 0.5, 4, "#cfcabf", [0, 0.25, 0], { rough: 0.9, map: concreteTex }));
      [-1.2, 0, 1.2].forEach((x) =>
        [-1.2, 1.2].forEach((z) => g2.add(box(0.28, 0.14, 0.28, "#b7b1a4", [x, 0.57, z], { rough: 0.9 })))
      );

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
        // 4. 데크/포치/조경
        const deckX = hw / 2 + 0.75;
        g4.add(box(1.5, 0.16, hd, "#a9855c", [deckX, slabTop - 0.06, 0], { rough: 0.85 }));
        const railX = deckX + 0.72;
        for (let z = -hd / 2 + 0.1; z <= hd / 2; z += 0.5) g4.add(box(0.09, 0.5, 0.09, "#8a6b47", [railX, slabTop + 0.2, z], { rough: 0.85 }));
        g4.add(box(0.1, 0.08, hd, "#8a6b47", [railX, slabTop + 0.44, 0], { rough: 0.85 }));
        g4.add(box(0.4, 0.16, 0.8, "#b9b3a6", [deckX + 0.55, slabTop - 0.18, hd / 2 + 0.2], { rough: 0.9, map: concreteTex }));
        g4.add(box(0.4, 0.16, 0.8, "#c3bdb0", [deckX + 0.9, slabTop - 0.34, hd / 2 + 0.2], { rough: 0.9, map: concreteTex }));

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
