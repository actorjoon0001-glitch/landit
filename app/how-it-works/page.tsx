import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용 방법 — LANDIT",
  description: "LANDIT가 토지 매물부터 주택 시공까지 잇는 방식을 소개합니다.",
};

const FLOW = [
  {
    t: "1. 땅을 고른다",
    d: "지도에서 매물 토지를 탐색합니다. 용도지역·경사·도로 접함·인프라 인입 여부·조망 같은 실제 판단 요소를 카드로 확인합니다.",
  },
  {
    t: "2. 개발 후를 시뮬레이션한다",
    d: "선택한 땅이 나대지일 때와 개발된 뒤의 모습을 비교하고, 원하는 모듈러주택을 실제로 앉혀 봅니다. 건폐 사용률·일조·시공 기간까지 즉시 확인합니다.",
  },
  {
    t: "3. 비용을 계산한다",
    d: "대지 매입가와 선택한 주택의 시공비를 합산해 예상 총 비용을 보여줍니다. 여러 주택을 바꿔 가며 예산에 맞는 조합을 찾습니다.",
  },
  {
    t: "4. 거래와 시공을 잇는다",
    d: "마음에 들면 상담을 신청합니다. 토지 거래 진행과 검증된 시공사 연결을 한 번에 이어 드립니다. 땅 고르기에서 안착(land it)까지 끊김 없이.",
  },
];

const WHY = [
  ["흩어진 정보를 한곳에", "토지 매물, 규제 정보, 시공 상품이 제각기 흩어져 있던 것을 하나의 화면에서 판단합니다."],
  ["상상을 시각으로", "'이 땅에 집을 지으면 어떨까'라는 막연한 상상을 구체적인 시뮬레이션으로 바꿔 줍니다."],
  ["거래에서 시공까지", "부동산 따로, 시공사 따로 알아보던 과정을 LANDIT 하나로 연결합니다."],
];

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <span className="inline-flex rounded-full border border-brand/20 bg-sand px-3 py-1 text-xs font-semibold text-brand">
        LANDIT = Land + Build it + Land it
      </span>
      <h1 className="mt-4 text-4xl font-black tracking-tight">
        땅을 고르는 순간부터, 집에 안착하기까지
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-foreground/60">
        LANDIT는 전원주택·세컨하우스·모듈러주택을 원하는 사람이 겪던 복잡한
        과정을 하나의 흐름으로 잇는 토지-주택 통합 플랫폼입니다.
      </p>

      <div className="mt-12 space-y-4">
        {FLOW.map((s, i) => (
          <div
            key={i}
            className="flex gap-4 rounded-2xl border border-black/5 bg-white p-5"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-black text-white">
              {i + 1}
            </div>
            <div>
              <h2 className="font-bold">{s.t}</h2>
              <p className="mt-1 text-sm leading-relaxed text-foreground/60">
                {s.d}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-16 text-2xl font-black tracking-tight">
        왜 LANDIT인가요?
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {WHY.map(([t, d]) => (
          <div key={t} className="rounded-2xl bg-sand p-5">
            <h3 className="font-bold text-brand">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/60">{d}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-2xl bg-brand p-8 text-center text-white">
        <h2 className="text-2xl font-black">지금 바로 확인해 보세요</h2>
        <p className="mx-auto mt-2 max-w-md text-white/80">
          지도에서 땅 하나를 고르고, 그 위에 집이 앉혀지는 모습을 미리 보세요.
        </p>
        <Link
          href="/explore"
          className="mt-6 inline-block rounded-full bg-white px-7 py-3 font-bold text-brand transition hover:bg-white/90"
        >
          땅 둘러보기 →
        </Link>
      </div>
    </div>
  );
}
