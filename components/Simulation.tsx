"use client";

import { useEffect, useRef, useState } from "react";
import type { Land, ModularHouse } from "@/lib/data";

/* ------------------------------------------------------------------ *
 * 아이소메트릭(2.5D) 시공 시뮬레이션
 * 큐보이드(3면 음영)를 월드 좌표(x,y,z)에 쌓아 SimCity 스타일 장면을 구성.
 * 타임라인 단계가 오를수록 토목 → 기초 → 주택 → 데크가 누적됩니다.
 * ------------------------------------------------------------------ */

const T = 22; // 타일 반너비 (타일폭 2T)
const ZH = 15; // z 1단위당 화면 높이
const OX = 200;
const OY = 120;

type P2 = [number, number];
const iso = (x: number, y: number, z = 0): P2 => [
  OX + (x - y) * T,
  OY + (x + y) * (T / 2) - z * ZH,
];
const pts = (arr: P2[]) => arr.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

function adjust(hex: string, f: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// 큐보이드: 원점(x,y,z)에서 크기(w,d,h). 상단/좌(+y)/우(+x) 3면 음영.
function box(
  key: string,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: string,
  o: { top?: number; left?: number; right?: number; stroke?: string } = {}
) {
  const top = o.top ?? 1.12;
  const left = o.left ?? 0.9;
  const right = o.right ?? 0.72;
  const stroke = o.stroke ?? "rgba(0,0,0,0.12)";
  const topF = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)];
  const rightF = [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)];
  const leftF = [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)];
  return (
    <g key={key}>
      <polygon points={pts(leftF)} fill={adjust(color, left)} stroke={stroke} strokeWidth="0.4" />
      <polygon points={pts(rightF)} fill={adjust(color, right)} stroke={stroke} strokeWidth="0.4" />
      <polygon points={pts(topF)} fill={adjust(color, top)} stroke={stroke} strokeWidth="0.4" />
    </g>
  );
}

// 사각뿔(흙더미/나무 수관)
function pyramid(key: string, x: number, y: number, z: number, w: number, d: number, h: number, color: string) {
  const apex = iso(x + w / 2, y + d / 2, z + h);
  const b0 = iso(x, y, z);
  const b1 = iso(x + w, y, z);
  const b2 = iso(x + w, y + d, z);
  const b3 = iso(x, y + d, z);
  return (
    <g key={key}>
      <polygon points={pts([b1, b2, apex])} fill={adjust(color, 0.72)} />
      <polygon points={pts([b2, b3, apex])} fill={adjust(color, 0.9)} />
      <polygon points={pts([b0, b1, apex])} fill={adjust(color, 1.1)} />
    </g>
  );
}

// 벽면 패널(창/문 등) — +y 면
const panelY = (key: string, Y: number, a: number, b: number, c: number, d: number, fill: string, op = 1) => (
  <polygon key={key} points={pts([iso(a, Y, c), iso(b, Y, c), iso(b, Y, d), iso(a, Y, d)])} fill={fill} opacity={op} stroke="rgba(0,0,0,0.15)" strokeWidth="0.25" />
);
// +x 면
const panelX = (key: string, X: number, a: number, b: number, c: number, d: number, fill: string, op = 1) => (
  <polygon key={key} points={pts([iso(X, a, c), iso(X, b, c), iso(X, b, d), iso(X, a, d)])} fill={fill} opacity={op} stroke="rgba(0,0,0,0.15)" strokeWidth="0.25" />
);

function tree(key: string, x: number, y: number, autumn = false) {
  const foliage = autumn ? "#c9772f" : "#4f7a3f";
  return (
    <g key={key}>
      {box(`${key}-t`, x, y, 0, 0.18, 0.18, 0.7, "#6b4a2e", { top: 1.05, left: 0.85, right: 0.7 })}
      {pyramid(`${key}-f`, x - 0.35, y - 0.35, 0.6, 0.9, 0.9, 1.1, foliage)}
    </g>
  );
}

// 지붕
function roof(key: string, hx: number, hy: number, hw: number, hd: number, ht: number, kind: ModularHouse["roof"]) {
  const rh = 0.9;
  if (kind === "flat") {
    return box(key, hx - 0.1, hy - 0.1, ht, hw + 0.2, hd + 0.2, 0.18, "#3a3f45");
  }
  if (kind === "mono") {
    const low = ht, high = ht + rh;
    const slope = [iso(hx, hy, low), iso(hx + hw, hy, low), iso(hx + hw, hy + hd, high), iso(hx, hy + hd, high)];
    const endX = [iso(hx + hw, hy, low), iso(hx + hw, hy + hd, high), iso(hx + hw, hy + hd, low)];
    return (
      <g key={key}>
        <polygon points={pts(endX)} fill="#4a5058" />
        <polygon points={pts(slope)} fill="#565d66" stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" />
      </g>
    );
  }
  // gable — 용마루는 x축을 따라
  const midY = hy + hd / 2;
  const peak = ht + rh;
  const leftSlope = [iso(hx, hy, ht), iso(hx + hw, hy, ht), iso(hx + hw, midY, peak), iso(hx, midY, peak)];
  const rightSlope = [iso(hx, midY, peak), iso(hx + hw, midY, peak), iso(hx + hw, hy + hd, ht), iso(hx, hy + hd, ht)];
  const gableNear = [iso(hx + hw, hy, ht), iso(hx + hw, hy + hd, ht), iso(hx + hw, midY, peak)];
  return (
    <g key={key}>
      <polygon points={pts(leftSlope)} fill="#4a5058" stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" />
      <polygon points={pts(gableNear)} fill="#e7e3da" stroke="rgba(0,0,0,0.12)" strokeWidth="0.3" />
      <polygon points={pts(rightSlope)} fill="#5b636d" stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" />
    </g>
  );
}

const STAGES = [
  { key: "raw", label: "나대지", desc: "매물로 나온 원지반 상태" },
  { key: "civil", label: "토목공사", desc: "부지 정지·옹벽·굴착 작업" },
  { key: "found", label: "기초공사", desc: "콘크리트 기초 타설" },
  { key: "house", label: "주택 설치", desc: "이동식 모듈러 주택 앉힘" },
  { key: "finish", label: "포치·데크", desc: "데크·포치·조경 마감" },
];

export default function Simulation({ land, house }: { land: Land; house: ModularHouse }) {
  const [stage, setStage] = useState(3);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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
    }, 1100);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing]);

  const play = () => {
    if (stage >= STAGES.length - 1) setStage(0);
    setPlaying(true);
  };

  // 주택 배치 파라미터
  const fpRatio = Math.min(0.5, house.areaPy / land.areaPy);
  const hw = 2.4 + Math.min(1.3, house.areaPy / 26); // 폭(x)
  const hd = 2.0 + Math.min(0.9, house.areaPy / 40); // 깊이(y)
  const slabX = 1, slabY = 1, slabW = 4, slabH = 4;
  const hx = slabX + (slabW - hw) / 2;
  const hy = slabY + (slabH - hd) / 2;
  const slabTop = 0.5;
  const wallH = 1.5;
  const wallTop = slabTop + wallH;

  // 지반 타일
  const groundTiles: React.ReactNode[] = [];
  const greens = ["#7ba05b", "#86ab63", "#729655"];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const inPad = i >= 1 && i < 5 && j >= 1 && j < 5;
      const graded = stage >= 1 && inPad;
      const gv = (i * 3 + j * 5) % 3;
      const color = graded ? "#b79a6f" : greens[gv];
      const tp = [iso(i, j, 0), iso(i + 1, j, 0), iso(i + 1, j + 1, 0), iso(i, j + 1, 0)];
      groundTiles.push(
        <polygon key={`g${i}-${j}`} points={pts(tp)} fill={color} stroke="rgba(0,0,0,0.06)" strokeWidth="0.3" />
      );
    }
  }

  const Layer = ({ show, children }: { show: boolean; children: React.ReactNode }) => (
    <g style={{ opacity: show ? 1 : 0, transition: "opacity 0.55s ease" }}>{show ? children : null}</g>
  );

  const won = (n: number) => new Intl.NumberFormat("ko-KR").format(Math.round(n));

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" />
          <span className="text-sm font-semibold">시공 시뮬레이션</span>
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

      {/* 아이소메트릭 장면 */}
      <svg viewBox="0 76 400 210" className="block w-full bg-gradient-to-b from-[#dceaf3] to-[#eef5f0]" role="img" aria-label={`${land.title} 시공 ${STAGES[stage].label} 단계`}>
        {/* 하늘 요소 */}
        <circle cx="332" cy="112" r="15" fill="#ffe08a" opacity="0.85" />
        <ellipse cx="92" cy="108" rx="24" ry="8" fill="#ffffff" opacity="0.6" />
        <ellipse cx="120" cy="103" rx="16" ry="6" fill="#ffffff" opacity="0.5" />

        {/* 흙 기반 + 지반 */}
        {box("earth", 0, 0, -0.7, 6, 6, 0.7, "#6b4f34", { top: 1.0, left: 0.8, right: 0.62 })}
        {groundTiles}

        {/* 0. 나대지 자연물 (토목 시작 전) */}
        <Layer show={stage === 0}>
          {tree("t0", 2.2, 2.0)}
          {tree("t1", 3.6, 3.2)}
          {tree("t2", 1.6, 3.6)}
          {pyramid("rock0", 3.2, 1.6, 0, 0.5, 0.5, 0.3, "#9a9488")}
        </Layer>

        {/* 1. 토목공사: 옹벽 + 흙더미 + 굴착기 */}
        <Layer show={stage >= 1}>
          {/* 옹벽 (앞쪽 y=5 모서리) */}
          {box("wall", 1, 4.85, 0, 4, 0.25, 0.9, "#b8b2a6")}
          {/* 흙더미 */}
          {pyramid("d1", 0.2, 2.4, 0, 0.9, 0.9, 0.85, "#b5946a")}
          {pyramid("d2", 5.0, 1.2, 0, 0.8, 0.8, 0.75, "#b5946a")}
        </Layer>
        {/* 굴착기는 토목 단계에서만 */}
        <Layer show={stage === 1}>
          {box("ex-track", 2.6, 2.4, 0, 1.5, 0.7, 0.25, "#3b3f45")}
          {box("ex-body", 2.75, 2.5, 0.25, 1.0, 0.9, 0.55, "#f2c12e")}
          {box("ex-cab", 2.8, 2.55, 0.8, 0.6, 0.7, 0.55, "#e8b420", { top: 1.1 })}
          {panelX("ex-glass", 3.4, 2.6, 3.15, 0.9, 1.25, "#bfe3f0")}
          {/* 붐/암 */}
          {box("ex-boom", 3.7, 2.7, 0.45, 1.1, 0.16, 0.16, "#f2c12e")}
          {box("ex-bucket", 4.7, 2.6, 0.1, 0.35, 0.4, 0.35, "#c9971f")}
        </Layer>

        {/* 2. 기초공사: 콘크리트 슬래브 + 기초 피어 */}
        <Layer show={stage >= 2}>
          {box("slab", slabX, slabY, 0, slabW, slabH, stage >= 3 ? slabTop : 0.35, "#cfcabf", { top: 1.08, left: 0.86, right: 0.68 })}
          {stage === 2 && (
            <>
              {panelX("reb1", slabX + slabW, slabY + 0.5, slabY + 3.5, 0.02, 0.33, "#8c8577", 0.5)}
              {[1.4, 2.4, 3.4].map((gx) => box(`pier${gx}`, gx, 2.4, 0.35, 0.25, 0.25, 0.2, "#b7b1a4"))}
            </>
          )}
        </Layer>

        {/* 3. 이동식 주택 */}
        <Layer show={stage >= 3}>
          {box("house", hx, hy, slabTop, hw, hd, wallH, house.color, { top: 1.1, left: 0.92, right: 0.74 })}
          {/* 창문 (+y 면) */}
          {panelY("w1", hy + hd, hx + 0.3, hx + 0.9, slabTop + 0.5, slabTop + 1.05, "#bfe3f0")}
          {panelY("w2", hy + hd, hx + hw - 0.9, hx - 0.3 + hw, slabTop + 0.5, slabTop + 1.05, "#bfe3f0")}
          {/* 문 (+x 면) */}
          {panelX("door", hx + hw, hy + hd / 2 - 0.3, hy + hd / 2 + 0.3, slabTop, slabTop + 1.0, "#5a4632")}
          {/* 창문 (+x 면) */}
          {panelX("wx", hx + hw, hy + 0.25, hy + 0.75, slabTop + 0.5, slabTop + 1.0, "#bfe3f0")}
          {roof("roof", hx, hy, hw, hd, wallTop, house.roof)}
        </Layer>

        {/* 4. 포치 · 데크 · 조경 */}
        <Layer show={stage >= 4}>
          {/* 데크 (+x 방향으로 확장) */}
          {box("deck", hx + hw, hy, slabTop - 0.15, 1.2, hd, 0.15, "#a9855c", { top: 1.1, left: 0.88, right: 0.7 })}
          {/* 데크 난간 기둥 */}
          {[0, 0.6, 1.2].map((dy) => box(`rail${dy}`, hx + hw + 1.15, hy + dy, slabTop, 0.1, 0.1, 0.5, "#8a6b47"))}
          {box("rail-top", hx + hw + 1.15, hy, slabTop + 0.45, 0.1, hd, 0.08, "#8a6b47")}
          {/* 포치 계단 */}
          {box("step1", hx + hw + 0.2, hy + hd / 2 - 0.35, slabTop - 0.35, 0.3, 0.7, 0.18, "#b9b3a6")}
          {box("step2", hx + hw + 0.5, hy + hd / 2 - 0.35, slabTop - 0.2, 0.3, 0.7, 0.18, "#c3bdb0")}
          {/* 조경수 — 주택 앞·측면에 배치(전면에 그려 겹침이 자연스럽게) */}
          {tree("ft1", 0.4, 4.6)}
          {tree("ft2", 4.9, 4.5)}
          {tree("ft3", 3.4, 5.2)}
          {/* 관목 */}
          {pyramid("sh1", 0.9, 3.4, 0.5, 0.5, 0.5, 0.4, "#5c8a48")}
          {pyramid("sh2", 0.9, 4.0, 0.5, 0.5, 0.5, 0.4, "#5c8a48")}
          {/* 자동차 */}
          {box("car-body", 0.4, 4.9, 0, 1.4, 0.7, 0.32, "#c9524a", { top: 1.12 })}
          {box("car-cab", 0.7, 4.95, 0.32, 0.7, 0.6, 0.3, "#d8615a", { top: 1.14 })}
        </Layer>
      </svg>

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
              <span
                className={`text-[10px] font-medium transition sm:text-[11px] ${
                  i === stage ? "text-brand" : "text-foreground/45"
                }`}
              >
                {s.label}
              </span>
            </button>
          ))}
        </div>
        {/* 진행 바 */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${(stage / (STAGES.length - 1)) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-foreground/50">{STAGES[stage].desc}</p>
      </div>

      {/* 지표 */}
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
