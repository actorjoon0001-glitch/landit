import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LANDS, getLand, housesForLand } from "@/lib/data";
import LandDetail from "@/components/LandDetail";

export function generateStaticParams() {
  return LANDS.map((l) => ({ id: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const land = getLand(id);
  if (!land) return { title: "매물을 찾을 수 없습니다 — LANDIT" };
  return {
    title: `${land.title} — LANDIT`,
    description: land.summary,
  };
}

export default async function LandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const land = getLand(id);
  if (!land) notFound();

  const houses = housesForLand(land);
  if (houses.length === 0) {
    // 대지가 작아 추천 주택이 없으면 전체에서 가장 작은 주택이라도 노출
    const { MODULAR_HOUSES } = await import("@/lib/data");
    const fallback = [...MODULAR_HOUSES]
      .sort((a, b) => a.areaPy - b.areaPy)
      .slice(0, 2);
    return <LandDetail land={land} houses={fallback} />;
  }

  return <LandDetail land={land} houses={houses} />;
}
