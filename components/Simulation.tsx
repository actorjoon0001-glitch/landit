"use client";

import { useState } from "react";
import type { Land, ModularHouse } from "@/lib/data";

// 지붕 형태별 SVG path 생성기 (하우스 폭 w, 벽 높이 wallH 기준)
function roofPath(roof: ModularHouse["roof"], w: number, wallH: number) {
  const peak = 26;
  if (roof === "flat") {
    return `M -4 0 L ${w + 4} 0 L ${w + 4} -6 L -4 -6 Z`;
  }
  if (roof === "mono") {
    return `M -4 0 L ${w + 4} 0 L ${w + 4} -${peak} L -4 -6 Z`;
  }
  // gable
  return `M -6 0 L ${w + 6} 0 L ${w / 2} -${peak} Z`;
  void wallH;
}

export default function Simulation({
  land,
  house,
}: {
  land: Land;
  house: ModularHouse;
}) {
  const [built, setBuilt] = useState(true);
  const [season, setSeason] = useState<"summer" | "autumn">("summer");

  const ground = season === "summer" ? "#7ba05b" : "#c19a4a";
  const groundDark = season === "summer" ? "#5e8144" : "#a07d31";

  // 대지 대비 주택 footprint (건폐율 데모)
  const footprint = Math.min(0.55, house.areaPy / land.areaPy);
  const houseW = 120 * Math.sqrt(footprint) * 1.6;
  const houseWallH = 46;

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" />
          <span className="text-sm font-semibold">가상 시뮬레이션</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex rounded-full bg-sand p-0.5">
            <button
              onClick={() => setBuilt(false)}
              className={`rounded-full px-3 py-1 font-medium transition ${
                !built ? "bg-white shadow-sm" : "text-foreground/50"
              }`}
            >
              현재 나대지
            </button>
            <button
              onClick={() => setBuilt(true)}
              className={`rounded-full px-3 py-1 font-medium transition ${
                built ? "bg-white shadow-sm" : "text-foreground/50"
              }`}
            >
              개발 후
            </button>
          </div>
          <button
            onClick={() =>
              setSeason((s) => (s === "summer" ? "autumn" : "summer"))
            }
            className="rounded-full border border-black/10 px-3 py-1 font-medium transition hover:bg-sand"
          >
            {season === "summer" ? "☀ 여름" : "🍂 가을"}
          </button>
        </div>
      </div>

      <svg
        viewBox="0 0 320 220"
        className="block w-full"
        role="img"
        aria-label={`${land.title}에 ${house.name}을 배치한 시뮬레이션`}
      >
        {/* 하늘 */}
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cfeaf7" />
            <stop offset="100%" stopColor="#eaf6fb" />
          </linearGradient>
          <linearGradient id="lot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ground} />
            <stop offset="100%" stopColor={groundDark} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="320" height="120" fill="url(#sky)" />
        <circle cx="262" cy="40" r="18" fill="#ffe08a" opacity="0.9" />

        {/* 원경 산 */}
        <path d="M0 120 L60 66 L120 108 L180 60 L250 104 L320 74 L320 120 Z" fill="#a9c3b0" opacity="0.7" />
        <path d="M0 120 L90 88 L160 116 L230 84 L320 112 L320 120 Z" fill="#8fb39c" opacity="0.8" />

        {/* 대지(원근 사다리꼴) */}
        <path d="M40 120 L280 120 L320 210 L0 210 Z" fill="url(#lot)" />
        <path
          d="M40 120 L280 120 L320 210 L0 210 Z"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.35"
          strokeDasharray="4 4"
        />

        {/* 진입 도로 */}
        {land.road && (
          <path d="M150 210 L170 210 L164 120 L156 120 Z" fill="#c9c2b4" />
        )}

        {!built ? (
          <>
            {/* 나대지 상태: 잡초 몇 개 */}
            {[60, 120, 200, 250].map((cx, i) => (
              <g key={i} transform={`translate(${cx} ${165 + (i % 2) * 20})`}>
                <path
                  d="M0 0 Q-4 -12 -2 -18 M0 0 Q0 -14 0 -20 M0 0 Q4 -12 2 -18"
                  stroke={groundDark}
                  strokeWidth="1.4"
                  fill="none"
                />
              </g>
            ))}
            <text
              x="160"
              y="200"
              textAnchor="middle"
              fontSize="9"
              fill="#ffffff"
              opacity="0.8"
            >
              {land.areaPy}평 · {land.slope}
            </text>
          </>
        ) : (
          <g style={{ animation: "growHouse 0.6s cubic-bezier(0.22,1,0.36,1) both" }}>
            {/* 나무 조경 */}
            {[38, 292].map((cx, i) => (
              <g key={i} transform={`translate(${cx} 168)`}>
                <rect x="-2" y="0" width="4" height="14" fill="#6b4f32" />
                <circle cx="0" cy="-4" r="12" fill={season === "summer" ? "#5e8144" : "#c46a2a"} />
              </g>
            ))}

            {/* 집 배치: 대지 중앙 뒤쪽 */}
            <g transform={`translate(${160 - houseW / 2} ${168 - houseWallH})`}>
              {/* 그림자 */}
              <ellipse
                cx={houseW / 2}
                cy={houseWallH + 6}
                rx={houseW / 1.5}
                ry="7"
                fill="#000000"
                opacity="0.12"
              />
              {/* 벽 */}
              <rect
                x="0"
                y="0"
                width={houseW}
                height={houseWallH}
                fill={house.color}
                rx="1.5"
              />
              {/* 측벽 음영 */}
              <rect x={houseW - 10} y="0" width="10" height={houseWallH} fill="#000" opacity="0.08" />
              {/* 지붕 */}
              <path
                d={roofPath(house.roof, houseW, houseWallH)}
                fill="#3a3f45"
              />
              {/* 문 */}
              <rect
                x={houseW / 2 - 5}
                y={houseWallH - 20}
                width="10"
                height="20"
                fill="#4a3d2e"
                rx="1"
              />
              {/* 창문 */}
              <rect x="8" y="10" width="14" height="12" fill="#bfe3f0" stroke="#fff" strokeWidth="1" />
              <rect
                x={houseW - 24}
                y="10"
                width="14"
                height="12"
                fill="#bfe3f0"
                stroke="#fff"
                strokeWidth="1"
              />
              {/* 데크 */}
              <rect x="-8" y={houseWallH} width={houseW + 16} height="6" fill="#a9855c" />
            </g>

            <text x="160" y="204" textAnchor="middle" fontSize="9" fill="#fff" opacity="0.9">
              {house.name} · 전용 {house.areaPy}평
            </text>
          </g>
        )}
      </svg>

      <div className="grid grid-cols-3 divide-x divide-black/5 border-t border-black/5 text-center">
        <Stat label="일조 점수" value={`${land.sunlight}/100`} />
        <Stat label="건폐 사용" value={`${Math.round(footprint * 100)}%`} />
        <Stat label="예상 시공" value={`${house.buildWeeks}주`} />
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
