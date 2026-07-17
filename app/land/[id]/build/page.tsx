import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LANDS, getLand, housesForLand, MODULAR_HOUSES } from "@/lib/data";
import Builder from "@/components/Builder";

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
  if (!land) return { title: "직접 짓기 — LANDIT" };
  return {
    title: `직접 짓기: ${land.title} — LANDIT`,
    description: `${land.title}에 내 손으로 토목·기초·주택을 배치해 보세요.`,
  };
}

export default async function BuildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const land = getLand(id);
  if (!land) notFound();

  const houses = housesForLand(land);
  const house = houses[0] ?? MODULAR_HOUSES[0];
  return <Builder land={land} house={house} />;
}
