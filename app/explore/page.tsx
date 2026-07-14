import type { Metadata } from "next";
import LandMap from "@/components/LandMap";

export const metadata: Metadata = {
  title: "땅 둘러보기 — LANDIT",
  description: "지도에서 매물 토지를 고르고 시뮬레이션을 시작하세요.",
};

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">매물 토지 지도</h1>
        <p className="mt-2 text-foreground/60">
          지도에서 마음에 드는 땅을 고르세요. 클릭하면 개발 시뮬레이션과 모듈러주택
          배치를 확인할 수 있습니다.
        </p>
      </div>
      <LandMap />
    </div>
  );
}
