"use client";

import { useState } from "react";
import Link from "next/link";
import Simulation from "@/components/Simulation";
import {
  type Land,
  type ModularHouse,
  eok,
  won,
  landTotal,
} from "@/lib/data";

function Fact({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-xl bg-sand px-3 py-2.5">
      <p className="text-[11px] text-foreground/50">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold ${
          ok === false ? "text-red-600" : ok ? "text-brand" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function LandDetail({
  land,
  houses,
}: {
  land: Land;
  houses: ModularHouse[];
}) {
  const [selected, setSelected] = useState<ModularHouse>(houses[0]);
  const [sent, setSent] = useState(false);

  const land만 = landTotal(land);
  const total = land만 + selected.priceKRW;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <Link
        href="/explore"
        className="text-sm font-medium text-foreground/50 hover:text-brand"
      >
        ← 지도로 돌아가기
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand">{land.region}</p>
          <h1 className="text-3xl font-black tracking-tight">{land.title}</h1>
          <p className="mt-1 text-sm text-foreground/50">{land.address}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-foreground/40">대지 가격</p>
          <p className="text-2xl font-black">{eok(land만)}</p>
          <p className="text-xs text-foreground/40">
            {land.areaPy}평 · 평당 {land.pricePerPy}만원
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* 좌: 시뮬레이션 */}
        <div>
          <Simulation land={land} house={selected} />

          <div className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
            <p className="text-sm font-semibold">이 땅에 앉힐 모듈러주택 선택</p>
            <p className="mt-0.5 text-xs text-foreground/50">
              대지 규모에 맞춰 추천된 주택입니다. 골라서 시뮬레이션을 바꿔 보세요.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {houses.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setSelected(h)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected.id === h.id
                      ? "border-brand bg-brand/5"
                      : "border-black/5 hover:border-black/15"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded"
                      style={{ background: h.color }}
                    />
                    <span className="text-sm font-bold">{h.name}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-foreground/50">
                    {h.style} · {h.areaPy}평 · 방 {h.bedrooms}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-brand">
                    {eok(h.priceKRW)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 우: 정보 + 비용 + CTA */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold">토지 정보</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">
              {land.summary}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Fact label="용도지역" value={land.zoning} />
              <Fact label="경사" value={land.slope} />
              <Fact
                label="도로 접함"
                value={land.road ? "접함" : "맹지"}
                ok={land.road}
              />
              <Fact label="상수도" value={land.utilities.water ? "인입" : "개발필요"} ok={land.utilities.water} />
              <Fact label="전기" value={land.utilities.power ? "인입" : "개발필요"} ok={land.utilities.power} />
              <Fact label="오수" value={land.utilities.sewage ? "인입" : "정화조"} ok={land.utilities.sewage} />
              <Fact label="조망" value={land.view} />
              <Fact label="일조" value={`${land.sunlight}/100`} ok />
              <Fact label="적합 주택" value={`${land.suitableFor.length}종`} />
            </div>
          </div>

          {/* 비용 요약 */}
          <div className="rounded-2xl border border-black/5 bg-white p-5">
            <h2 className="text-lg font-bold">예상 총 비용</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-foreground/60">대지 매입 ({land.areaPy}평)</dt>
                <dd className="font-semibold">{won(land만)}원</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-foreground/60">
                  {selected.name} 시공 ({selected.builder})
                </dt>
                <dd className="font-semibold">{won(selected.priceKRW)}원</dd>
              </div>
              <div className="my-2 border-t border-dashed border-black/10" />
              <div className="flex justify-between text-base">
                <dt className="font-bold">합계 (토지+시공)</dt>
                <dd className="font-black text-brand">{eok(total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-foreground/40">
              * 토목·인허가·인입 공사비는 별도이며 부지 조건에 따라 달라집니다.
              데모용 예상치입니다.
            </p>
          </div>

          {/* 관심/거래 연결 CTA */}
          <div className="rounded-2xl bg-brand p-5 text-white">
            {sent ? (
              <div className="text-center">
                <p className="text-2xl">✅</p>
                <p className="mt-2 font-bold">상담 신청이 접수되었습니다</p>
                <p className="mt-1 text-sm text-white/80">
                  담당 매니저가 토지 거래와 {selected.builder} 시공 상담을 위해
                  연락드립니다.
                </p>
              </div>
            ) : (
              <>
                <p className="font-bold">마음에 드시나요?</p>
                <p className="mt-1 text-sm text-white/80">
                  이 땅의 거래 진행과 {selected.builder} 시공 연결을 한 번에
                  신청하세요.
                </p>
                <button
                  onClick={() => setSent(true)}
                  className="mt-4 w-full rounded-xl bg-white py-3 font-bold text-brand transition hover:bg-white/90"
                >
                  거래 · 시공 상담 신청하기
                </button>
                <p className="mt-2 text-center text-[11px] text-white/60">
                  신청은 무료이며 계약 의무가 없습니다
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
