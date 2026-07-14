"use client";

import { useState } from "react";
import Link from "next/link";
import { LANDS, landTotal, eok, type Land } from "@/lib/data";

export default function LandMap() {
  const [active, setActive] = useState<Land | null>(null);
  const [region, setRegion] = useState<string>("전체");

  const regions = ["전체", ...Array.from(new Set(LANDS.map((l) => l.region)))];
  const shown = region === "전체" ? LANDS : LANDS.filter((l) => l.region === region);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      {/* 지도 */}
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {regions.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                region === r
                  ? "bg-brand text-white"
                  : "bg-sand text-foreground/60 hover:bg-black/5"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-black/5 bg-[#dfeae4] shadow-sm">
          <svg viewBox="0 0 100 100" className="block h-full w-full">
            {/* 지형 배경 */}
            <rect width="100" height="100" fill="#e4ede7" />
            <path d="M0 20 Q30 10 55 24 T100 18 L100 0 L0 0 Z" fill="#cfe0d5" />
            <path d="M0 100 L100 100 L100 70 Q70 82 45 72 T0 78 Z" fill="#d6e3da" />
            {/* 강 */}
            <path
              d="M-5 40 Q25 48 40 62 T80 78 Q92 82 105 76"
              fill="none"
              stroke="#a9cfe0"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.8"
            />
            {/* 격자 */}
            {[20, 40, 60, 80].map((g) => (
              <g key={g} stroke="#ffffff" strokeOpacity="0.4" strokeWidth="0.3">
                <line x1={g} y1="0" x2={g} y2="100" />
                <line x1="0" y1={g} x2="100" y2={g} />
              </g>
            ))}

            {/* 매물 핀 */}
            {shown.map((l) => {
              const isActive = active?.id === l.id;
              return (
                <g
                  key={l.id}
                  transform={`translate(${l.x} ${l.y})`}
                  className="cursor-pointer"
                  onMouseEnter={() => setActive(l)}
                  onClick={() => setActive(l)}
                >
                  <circle
                    r={isActive ? 4.4 : 3.2}
                    fill={isActive ? "#1f5a40" : "#2f7d5b"}
                    stroke="#fff"
                    strokeWidth="1"
                    className="transition-all"
                  />
                  <circle r="1.1" fill="#fff" />
                  {isActive && (
                    <circle
                      r="6.5"
                      fill="none"
                      stroke="#2f7d5b"
                      strokeWidth="0.6"
                      opacity="0.5"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {active && (
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl bg-white/95 p-3 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-brand">{active.region}</p>
                  <p className="text-sm font-bold">{active.title}</p>
                </div>
                <p className="whitespace-nowrap text-sm font-extrabold">
                  {eok(landTotal(active))}
                </p>
              </div>
            </div>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-foreground/40">
          핀에 마우스를 올리거나 눌러 매물을 확인하세요 · 데모용 자체 지도
        </p>
      </div>

      {/* 목록 */}
      <div className="space-y-3">
        {shown.map((l) => (
          <Link
            key={l.id}
            href={`/land/${l.id}`}
            onMouseEnter={() => setActive(l)}
            className={`block rounded-xl border p-4 transition ${
              active?.id === l.id
                ? "border-brand bg-brand/5"
                : "border-black/5 bg-white hover:border-black/15"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-brand">{l.region}</p>
                <p className="font-bold leading-tight">{l.title}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold">{eok(landTotal(l))}</p>
                <p className="text-[11px] text-foreground/40">
                  {l.areaPy}평 · 평당 {l.pricePerPy}만
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {l.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-sand px-2 py-0.5 text-[11px] text-foreground/60"
                >
                  #{t}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
