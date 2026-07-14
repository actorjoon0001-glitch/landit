"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREE_NS from "three";
import type { Land, ModularHouse } from "@/lib/data";

/* ------------------------------------------------------------------ *
 * 실시간 3D 시공 시뮬레이션 (Three.js)
 * 원근 카메라 · 태양광 그림자 · PBR 재질 · 드래그 회전.
 * 타임라인 단계가 오를수록 토목 → 기초 → 주택 → 데크가 지어집니다.
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

  // 씬 초기화 (1회)
  useEffect(() => {
    let disposed = false;
    (async () => {
      const THREE = (await import("three")) as typeof THREE_NS;
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const mount = mountRef.current;
      if (disposed || !mount) return;

      const W = mount.clientWidth || 600;
      const H = mount.clientHeight || 380;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#d7e8f2");
      scene.fog = new THREE.Fog("#d7e8f2", 22, 46);

      const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
      camera.position.set(8, 6.4, 8.5);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.8, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 7;
      controls.maxDistance = 22;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = 1.36;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.55;
      controls.addEventListener("start", () => (controls.autoRotate = false));

      // 조명
      const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3f, 0.75);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
      sun.position.set(7, 10, 5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -8;
      sun.shadow.camera.right = 8;
      sun.shadow.camera.top = 8;
      sun.shadow.camera.bottom = -8;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 34;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      scene.add(sun);

      // 헬퍼
      const mat = (color: string, o: { rough?: number; metal?: number; flat?: boolean; emissive?: string; emi?: number } = {}) =>
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: o.rough ?? 0.85,
          metalness: o.metal ?? 0,
          flatShading: o.flat ?? false,
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

      // 원경 지면 + 대지
      const groundMat = mat("#88ab63", { rough: 1 });
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      ground.receiveShadow = true;
      scene.add(ground);

      const PLOT = 6;
      scene.add(box(PLOT, 0.24, PLOT, "#6f9a52", [0, -0.12, 0], { rough: 1, cast: false }));
      scene.add(box(PLOT - 0.1, 0.7, PLOT - 0.1, "#6b4f34", [0, -0.55, 0], { rough: 1, cast: false }));

      // 스테이지 그룹
      const groups: Record<string, THREE_NS.Group> = {};
      const mkGroup = (key: string) => {
        const g = new THREE.Group();
        g.visible = false;
        g.userData.rt = 0;
        g.userData.shown = false;
        scene.add(g);
        groups[key] = g;
        return g;
      };
      const g0 = mkGroup("g0");
      const g1 = mkGroup("g1");
      const gExcav = mkGroup("gExcav");
      const g2 = mkGroup("g2");
      const g3 = mkGroup("g3");
      const g4 = mkGroup("g4");

      // 나무
      const tree = (x: number, z: number, s = 1) => {
        const g = new THREE.Group();
        g.add(box(0.22 * s, 0.8 * s, 0.22 * s, "#6b4a2e", [0, 0.4 * s, 0], { rough: 1 }));
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72 * s, 0), mat("#4f7a3f", { flat: true, rough: 0.95 }));
        f.position.y = 1.2 * s;
        f.scale.set(1, 1.15, 1);
        f.castShadow = true;
        f.receiveShadow = true;
        g.add(f);
        g.position.set(x, 0, z);
        return g;
      };

      // 0. 나대지 자연물
      g0.add(tree(-1.4, 1.0, 1.05));
      g0.add(tree(1.2, -0.6, 0.9));
      g0.add(tree(-0.6, -1.6, 1.0));
      {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), mat("#9a948a", { flat: true }));
        rock.position.set(1.4, 0.2, 1.2);
        rock.castShadow = true;
        rock.receiveShadow = true;
        g0.add(rock);
      }

      // 1. 토목: 정지 패드 + 옹벽 + 흙더미
      g1.add(box(4, 0.14, 4, "#b5946a", [0, 0.07, 0], { rough: 1, cast: false }));
      g1.add(box(4.2, 0.58, 0.24, "#c2bdb0", [0, 0.29, 2.95], { rough: 0.95 }));
      const pile = (x: number, z: number, h: number) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.7, h, 7), mat("#a8875c", { flat: true, rough: 1 }));
        c.position.set(x, h / 2, z);
        c.castShadow = true;
        c.receiveShadow = true;
        return c;
      };
      g1.add(pile(-2.6, -0.4, 0.9));
      g1.add(pile(2.7, -1.0, 0.75));

      // 굴착기 (토목 단계에서만)
      {
        const ex = new THREE.Group();
        ex.add(box(1.6, 0.32, 0.9, "#2f3237", [0, 0.16, 0], { rough: 0.7 }));
        ex.add(box(1.05, 0.55, 0.95, "#f2c12e", [0, 0.55, 0], { rough: 0.5, metal: 0.1 }));
        ex.add(box(0.62, 0.62, 0.72, "#e6b31f", [-0.15, 1.05, 0], { rough: 0.5 }));
        ex.add(box(0.06, 0.42, 0.6, "#bfe3f0", [0.17, 1.08, 0], { rough: 0.2, metal: 0.3, emissive: "#bfe3f0", emi: 0.1 }));
        // 붐/암/버킷
        const boom = box(1.2, 0.16, 0.16, "#f2c12e", [0.8, 0.62, 0], { rough: 0.5 });
        boom.rotation.z = -0.35;
        ex.add(boom);
        ex.add(box(0.36, 0.4, 0.44, "#c9971f", [1.5, 0.18, 0], { rough: 0.6, metal: 0.2 }));
        ex.position.set(0.3, 0, 0.2);
        ex.rotation.y = -0.5;
        gExcav.add(ex);
      }

      // 2. 기초: 슬래브 + 피어
      g2.add(box(4, 0.5, 4, "#cfcabf", [0, 0.25, 0], { rough: 0.9 }));
      [-1.2, 0, 1.2].forEach((x) =>
        [-1.2, 1.2].forEach((z) => g2.add(box(0.28, 0.14, 0.28, "#b7b1a4", [x, 0.57, z], { rough: 0.9 })))
      );

      // 3·4. 주택/데크 — house 의존, rebuildHouse로 채움
      const clearGroup = (g: THREE_NS.Group) => {
        for (let i = g.children.length - 1; i >= 0; i--) {
          const c = g.children[i] as THREE_NS.Mesh;
          g.remove(c);
          c.geometry?.dispose?.();
          const mm = c.material as THREE_NS.Material | THREE_NS.Material[] | undefined;
          if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
          else mm?.dispose?.();
        }
      };

      const buildHouse = (h: ModularHouse) => {
        clearGroup(g3);
        clearGroup(g4);
        const hw = Math.min(3.6, 2.6 + h.areaPy / 24);
        const hd = Math.min(3.0, 2.0 + h.areaPy / 40);
        const slabTop = 0.5;
        const wallH = 1.5;
        const wallTop = slabTop + wallH;

        // 벽
        g3.add(box(hw, wallH, hd, h.color, [0, slabTop + wallH / 2, 0], { rough: 0.8 }));
        // 문 (+z)
        g3.add(box(0.62, 1.0, 0.08, "#5a4632", [0, slabTop + 0.5, hd / 2 + 0.02], { rough: 0.7 }));
        // 창 (+z)
        const glass = { rough: 0.15, metal: 0.35, emissive: "#bfe3f0", emi: 0.12 };
        g3.add(box(0.6, 0.55, 0.06, "#bfe3f0", [-hw / 4 - 0.1, slabTop + 0.95, hd / 2 + 0.02], glass));
        g3.add(box(0.6, 0.55, 0.06, "#bfe3f0", [hw / 4 + 0.1, slabTop + 0.95, hd / 2 + 0.02], glass));
        // 창 (+x)
        g3.add(box(0.06, 0.55, 0.7, "#bfe3f0", [hw / 2 + 0.02, slabTop + 0.95, -hd / 4], glass));
        g3.add(box(0.06, 0.55, 0.7, "#bfe3f0", [hw / 2 + 0.02, slabTop + 0.95, hd / 4], glass));

        // 지붕
        const roofMat = mat("#3f454d", { rough: 0.7, flat: true });
        if (h.roof === "flat") {
          g3.add(box(hw + 0.3, 0.22, hd + 0.3, "#3a3f45", [0, wallTop + 0.11, 0], { rough: 0.7 }));
          const para = mat("#4a505a", { rough: 0.8 });
          void para;
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

        // 4. 데크 + 난간 + 계단
        const deckX = hw / 2 + 0.75;
        g4.add(box(1.5, 0.16, hd, "#a9855c", [deckX, slabTop - 0.06, 0], { rough: 0.9 }));
        const railX = deckX + 0.72;
        for (let z = -hd / 2 + 0.1; z <= hd / 2; z += 0.55) g4.add(box(0.1, 0.5, 0.1, "#8a6b47", [railX, slabTop + 0.2, z], { rough: 0.9 }));
        g4.add(box(0.1, 0.08, hd, "#8a6b47", [railX, slabTop + 0.44, 0], { rough: 0.9 }));
        // 계단
        g4.add(box(0.4, 0.16, 0.8, "#b9b3a6", [deckX + 0.55, slabTop - 0.18, hd / 2 + 0.2], { rough: 0.9 }));
        g4.add(box(0.4, 0.16, 0.8, "#c3bdb0", [deckX + 0.9, slabTop - 0.34, hd / 2 + 0.2], { rough: 0.9 }));

        // 조경수 · 관목 · 자동차
        g4.add(tree(-2.4, 1.9, 1.1));
        g4.add(tree(-2.5, -1.6, 1.0));
        g4.add(tree(2.6, 2.0, 0.95));
        [[-1.9, 2.4], [-1.4, 2.5]].forEach(([x, z]) => {
          const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat("#5c8a48", { flat: true }));
          s.position.set(x, 0.32, z);
          s.castShadow = true;
          s.receiveShadow = true;
          g4.add(s);
        });
        // 자동차
        const car = new THREE.Group();
        car.add(box(1.7, 0.36, 0.8, "#c9524a", [0, 0.36, 0], { rough: 0.4, metal: 0.3 }));
        car.add(box(0.95, 0.34, 0.72, "#d8615a", [-0.05, 0.64, 0], { rough: 0.35, metal: 0.3 }));
        [[-0.55, 0.42], [-0.55, -0.42], [0.55, 0.42], [0.55, -0.42]].forEach(([x, z]) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 16), mat("#22252a", { rough: 0.6 }));
          w.rotation.x = Math.PI / 2;
          w.position.set(x, 0.17, z);
          w.castShadow = true;
          car.add(w);
        });
        car.position.set(-2.3, 0, 2.0);
        car.rotation.y = 0.5;
        g4.add(car);
      };
      buildHouse(house);

      // 스테이지 표시 상태
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

      // 리사이즈
      const ro = new ResizeObserver(() => {
        const w = mount.clientWidth,
          h = mount.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      ro.observe(mount);

      // 애니메이션 루프 (리빌 이징)
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
        renderer.render(scene, camera);
      });

      apiRef.current = {
        setStage: applyStage,
        rebuildHouse: (h) => {
          buildHouse(h);
          // 현재 단계 반영 (재생성 후 표시상태 복구)
          const wasShown = { g3: g3.userData.shown, g4: g4.userData.shown };
          g3.visible = wasShown.g3;
          g4.visible = wasShown.g4;
          g3.scale.y = wasShown.g3 ? 1 : 0.001;
          g4.scale.y = wasShown.g4 ? 1 : 0.001;
        },
        dispose: () => {
          renderer.setAnimationLoop(null);
          ro.disconnect();
          controls.dispose();
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
      applyStage(3);
      setReady(true);
    })();

    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, []);

  // 단계 변경 반영
  useEffect(() => {
    apiRef.current?.setStage(stage);
  }, [stage]);

  // 주택 변경 반영
  useEffect(() => {
    apiRef.current?.rebuildHouse(house);
  }, [house]);

  // 재생
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

      {/* 3D 캔버스 */}
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

      {/* 타임라인 */}
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
