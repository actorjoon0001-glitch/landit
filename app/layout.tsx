import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LANDIT — 땅을 고르면, 집이 보인다",
  description:
    "전원주택·세컨하우스·모듈러주택을 위한 토지-주택 통합 플랫폼. 매물 땅을 지도에서 고르고, 개발 후 모습과 모듈러주택 배치를 가상 시뮬레이션으로 미리 봅니다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur-md">
          <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-black text-white">
                L
              </span>
              <span className="text-lg font-extrabold tracking-tight">
                LANDIT
              </span>
            </Link>
            <div className="flex items-center gap-1 text-sm font-medium sm:gap-2">
              <Link
                href="/explore"
                className="rounded-full px-3 py-2 text-foreground/70 transition hover:bg-sand hover:text-foreground"
              >
                땅 둘러보기
              </Link>
              <Link
                href="/how-it-works"
                className="hidden rounded-full px-3 py-2 text-foreground/70 transition hover:bg-sand hover:text-foreground sm:block"
              >
                이용 방법
              </Link>
              <Link
                href="/explore"
                className="rounded-full bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-dark"
              >
                시뮬레이션 시작
              </Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-black/5 bg-sand">
          <div className="mx-auto max-w-6xl px-5 py-12">
            <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
              <div className="max-w-sm">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-black text-white">
                    L
                  </span>
                  <span className="font-extrabold">LANDIT</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground/60">
                  Land + Build it + Land it. 땅을 고르는 순간부터 집에 안착하기까지,
                  토지 거래와 시공사 연결을 한 번에 잇는 토지-주택 통합 플랫폼.
                </p>
              </div>
              <div className="text-sm text-foreground/60">
                <p className="font-semibold text-foreground/80">서비스</p>
                <ul className="mt-3 space-y-2">
                  <li>
                    <Link href="/explore" className="hover:text-brand">
                      매물 토지 지도
                    </Link>
                  </li>
                  <li>
                    <Link href="/how-it-works" className="hover:text-brand">
                      이용 방법
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            <p className="mt-10 text-xs text-foreground/40">
              © 2026 LANDIT. 데모 목적의 프로토타입이며 실제 매물·거래 정보가 아닙니다.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
