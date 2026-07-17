import Link from "next/link";
import { LANDS, landTotal, eok, landImage } from "@/lib/data";

const STEPS = [
  {
    n: "01",
    title: "지도에서 땅을 고른다",
    body: "매물로 나온 전국의 토지를 지도에서 한눈에. 용도지역·경사·인프라·조망까지 조건으로 걸러 내 땅을 찾습니다.",
    icon: "🗺️",
  },
  {
    n: "02",
    title: "개발된 모습을 미리 본다",
    body: "나대지가 개발되었을 때의 모습과, 원하는 모듈러주택이 실제로 앉혀진 모습을 가상 시뮬레이션으로 확인합니다.",
    icon: "🏡",
  },
  {
    n: "03",
    title: "거래와 시공을 잇는다",
    body: "마음에 들면 그 자리에서 토지 거래를 진행하고, 검증된 시공사와 바로 연결됩니다. 땅 고르기부터 안착까지 한 흐름으로.",
    icon: "🤝",
  },
];

export default function Home() {
  const featured = LANDS.slice(0, 3);
  return (
    <>
      {/* Hero — 시네마틱 풀블리드 */}
      <section className="relative min-h-[86vh] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/img/hero-house.webp)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="relative mx-auto flex min-h-[86vh] max-w-6xl flex-col justify-center px-5 py-24">
          <div className="rise-in max-w-2xl text-white">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              Land · Build it · Land it
            </span>
            <h1 className="mt-6 text-5xl font-black leading-[1.08] tracking-tight sm:text-7xl">
              땅을 고르면,
              <br />
              <span className="text-[#8fe3b8]">집이 보입니다.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              전원주택·세컨하우스·모듈러주택을 꿈꾸는 당신을 위해. 매물로 나온
              땅을 지도에서 고르면, 개발 후의 모습과 모듈러주택이 앉혀진 모습을
              실사 시뮬레이션으로 미리 보여드립니다.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/explore"
                className="rounded-full bg-brand px-7 py-3.5 font-bold text-white shadow-lg shadow-black/20 transition hover:bg-brand-dark"
              >
                땅 둘러보고 시뮬레이션 →
              </Link>
              <Link
                href="/how-it-works"
                className="rounded-full border border-white/30 bg-white/10 px-7 py-3.5 font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                어떻게 작동하나요?
              </Link>
            </div>
            <dl className="mt-14 flex gap-10">
              {[
                ["6개+", "매물 토지"],
                ["4종", "모듈러주택"],
                ["1흐름", "거래→시공"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-3xl font-black">{v}</dt>
                  <dd className="mt-1 text-sm text-white/60">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-center text-3xl font-black tracking-tight">
          땅 고르기부터 안착까지, 세 단계
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-foreground/60">
          흩어져 있던 토지 매물·시각화·거래·시공을 하나의 흐름으로 연결합니다.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl">{s.icon}</span>
                <span className="text-sm font-black text-brand/30">{s.n}</span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured lands */}
      <section className="bg-sand py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex items-end justify-between">
            <h2 className="text-3xl font-black tracking-tight">추천 매물 토지</h2>
            <Link
              href="/explore"
              className="text-sm font-semibold text-brand hover:underline"
            >
              전체 지도 보기 →
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {featured.map((l) => (
              <Link
                key={l.id}
                href={`/land/${l.id}`}
                className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="relative h-44 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${landImage(l)})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-bold text-brand backdrop-blur">
                    {l.region}
                  </span>
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <p className="font-extrabold leading-tight drop-shadow">{l.title}</p>
                    <p className="mt-0.5 text-xs text-white/80">{l.view}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4">
                  <p className="text-lg font-black">{eok(landTotal(l))}</p>
                  <p className="text-xs text-foreground/45">{l.areaPy}평 · 평당 {l.pricePerPy}만</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-24 text-center">
        <h2 className="mx-auto max-w-xl text-3xl font-black tracking-tight sm:text-4xl">
          당신의 땅은 어떤 모습으로 안착할까요?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-foreground/60">
          지도에서 땅 하나를 고르고, 그 위에 집이 앉혀지는 순간을 지금 확인해
          보세요.
        </p>
        <Link
          href="/explore"
          className="mt-8 inline-block rounded-full bg-brand px-8 py-4 font-bold text-white shadow-sm transition hover:bg-brand-dark"
        >
          무료로 시뮬레이션 시작하기
        </Link>
      </section>
    </>
  );
}
