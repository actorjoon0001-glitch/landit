"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";
import { LANDS, landTotal, eok, type Land } from "@/lib/data";

const KOREA_CENTER: [number, number] = [36.2, 127.9];

function pinIcon(L: typeof LeafletNS, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="lm-pin${active ? " lm-pin--active" : ""}"><span></span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function popupHtml(l: Land) {
  return `
    <div class="lm-popup">
      <div class="lm-popup-region">${l.region}</div>
      <div class="lm-popup-title">${l.title}</div>
      <div class="lm-popup-meta">${l.areaPy}평 · ${l.view}</div>
      <div class="lm-popup-price">${eok(landTotal(l))}</div>
      <a class="lm-popup-link" href="/land/${l.id}">시뮬레이션 보기 →</a>
    </div>`;
}

export default function LandMap() {
  const [active, setActive] = useState<Land | null>(null);
  const [region, setRegion] = useState<string>("전체");

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const markersRef = useRef<Record<string, LeafletNS.Marker>>({});
  const LRef = useRef<typeof LeafletNS | null>(null);

  const regions = ["전체", ...Array.from(new Set(LANDS.map((l) => l.region)))];
  const shown = region === "전체" ? LANDS : LANDS.filter((l) => l.region === region);
  const shownIds = shown.map((l) => l.id).join(",");

  // 지도 초기화 (1회) — 모든 매물 마커 생성
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || mapRef.current || !mapEl.current) return;
      LRef.current = L;

      const map = L.map(mapEl.current, {
        center: KOREA_CENTER,
        zoom: 7,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }
      ).addTo(map);

      LANDS.forEach((l) => {
        const marker = L.marker([l.lat, l.lng], {
          icon: pinIcon(L, false),
          title: l.title,
        });
        marker.bindPopup(popupHtml(l), { closeButton: true, minWidth: 200 });
        marker.on("mouseover", () => setActive(l));
        marker.on("click", () => setActive(l));
        marker.addTo(map); // 기본 지역("전체")에서는 모두 표시
        markersRef.current[l.id] = marker;
      });

      map.fitBounds(
        L.latLngBounds(LANDS.map((l) => [l.lat, l.lng] as [number, number])),
        { padding: [40, 40] }
      );
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = {};
      }
    };
  }, []);

  // 지역 필터 → 보이는 마커만 표시 + 화면 맞춤
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const visible = shownIds ? shownIds.split(",") : [];
    LANDS.forEach((l) => {
      const marker = markersRef.current[l.id];
      if (!marker) return;
      if (visible.includes(l.id)) marker.addTo(map);
      else map.removeLayer(marker);
    });
    const pts = LANDS.filter((l) => visible.includes(l.id)).map(
      (l) => [l.lat, l.lng] as [number, number]
    );
    if (pts.length === 1) map.setView(pts[0], 11, { animate: true });
    else if (pts.length > 1)
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], animate: true });
  }, [shownIds]);

  // 활성 매물 → 마커 강조 + 팝업 + 이동
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      marker.setIcon(pinIcon(L, id === active?.id));
    });
    if (active) {
      const marker = markersRef.current[active.id];
      if (marker && map.hasLayer(marker)) {
        map.panTo([active.lat, active.lng], { animate: true });
        marker.openPopup();
      }
    }
  }, [active]);

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
        <div
          ref={mapEl}
          className="h-[460px] w-full overflow-hidden rounded-2xl border border-black/5 shadow-sm sm:h-[560px]"
          aria-label="매물 토지 지도"
        />
        <p className="mt-2 text-center text-xs text-foreground/40">
          핀을 누르면 매물 정보가 열립니다 · 지도 데이터 © OpenStreetMap
        </p>
      </div>

      {/* 목록 */}
      <div className="space-y-3 lg:max-h-[620px] lg:overflow-y-auto lg:pr-1">
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
