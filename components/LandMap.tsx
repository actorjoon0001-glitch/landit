"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LANDS, landTotal, eok, landImage, type Land } from "@/lib/data";

// V-World(국토교통부) 무료 인증키.
// 도메인 제한 공개키(등록 도메인에서만 동작)라 코드에 두어도 안전.
// Netlify 환경변수 NEXT_PUBLIC_VWORLD_KEY 로 덮어쓸 수 있으며, 없으면 OSM 폴백.
const VWORLD_KEY =
  process.env.NEXT_PUBLIC_VWORLD_KEY || "9E135238-3706-3733-B749-1EF38ADC45FD";
const HAS_VW = VWORLD_KEY.length > 0;

const KOREA_BOUNDS: [[number, number], [number, number]] = [
  [125.6, 33.0],
  [129.9, 38.7],
]; // [[west,south],[east,north]]

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

function makePin(active: boolean) {
  const el = document.createElement("div");
  el.className = "lm-pin" + (active ? " lm-pin--active" : "");
  el.appendChild(document.createElement("span"));
  return el;
}

function buildStyle(): maplibregl.StyleSpecification {
  const vw = (layer: string, ext: string) =>
    `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/${layer}/{z}/{y}/{x}.${ext}`;
  const domain = typeof window !== "undefined" ? window.location.origin : "";

  const sources: maplibregl.StyleSpecification["sources"] = {};
  const layers: maplibregl.LayerSpecification[] = [];

  if (HAS_VW) {
    // 검증된 Base 타일 사용 (세련된 무채색 느낌은 CSS 필터로 처리 — lm-muted)
    sources.base = { type: "raster", tiles: [vw("Base", "png")], tileSize: 256, attribution: "© 국토교통부 V-World" };
    sources.sat = { type: "raster", tiles: [vw("Satellite", "jpeg")], tileSize: 256, attribution: "© 국토교통부 V-World" };
    sources.hybrid = { type: "raster", tiles: [vw("Hybrid", "png")], tileSize: 256 };
    sources.cadastral = {
      type: "raster",
      tiles: [
        `https://api.vworld.kr/req/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=lp_pa_cbnd_bubun&STYLES=lp_pa_cbnd_bubun&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&KEY=${VWORLD_KEY}&DOMAIN=${domain}`,
      ],
      tileSize: 256,
    };
    layers.push({ id: "base-l", type: "raster", source: "base", layout: { visibility: "visible" } });
    layers.push({ id: "sat-l", type: "raster", source: "sat", layout: { visibility: "none" } });
    layers.push({ id: "hybrid-l", type: "raster", source: "hybrid", layout: { visibility: "none" } });
    layers.push({ id: "cad-l", type: "raster", source: "cadastral", layout: { visibility: "none" } });
  } else {
    sources.base = {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap 기여자",
    };
    layers.push({ id: "base-l", type: "raster", source: "base", layout: { visibility: "visible" } });
  }

  return { version: 8, sources, layers };
}

export default function LandMap() {
  const [active, setActive] = useState<Land | null>(null);
  const [region, setRegion] = useState<string>("전체");
  const [mode, setMode] = useState<"map" | "sat">("map");
  const [cadastral, setCadastral] = useState(false);
  const [ready, setReady] = useState(false);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const glRef = useRef<typeof maplibregl | null>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const elsRef = useRef<Record<string, HTMLElement>>({});
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const province = (l: Land) => l.region.split(" ")[0];
  const regions = ["전체", ...Array.from(new Set(LANDS.map(province)))];
  const shown = region === "전체" ? LANDS : LANDS.filter((l) => province(l) === region);
  const shownIds = shown.map((l) => l.id).join(",");

  // 지도 초기화
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gl = (await import("maplibre-gl")).default;
      if (cancelled || mapRef.current || !mapEl.current) return;
      glRef.current = gl;

      const map = new gl.Map({
        container: mapEl.current,
        style: buildStyle(),
        bounds: KOREA_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        maxBounds: [
          [123.5, 31.8],
          [132.2, 39.8],
        ],
        minZoom: 5.5,
        maxZoom: 18,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new gl.NavigationControl({ showCompass: false }), "top-left");
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();

      // 마커는 타일 로드와 무관하게 즉시 추가 (지도 생성 직후 배치 가능)
      LANDS.forEach((l) => {
        const el = makePin(false);
        el.addEventListener("mouseenter", () => setActive(l));
        el.addEventListener("click", () => setActive(l));
        const marker = new gl.Marker({ element: el }).setLngLat([l.lng, l.lat]).addTo(map);
        markersRef.current[l.id] = marker;
        elsRef.current[l.id] = el;
      });
      popupRef.current = new gl.Popup({ offset: 18, closeButton: true, maxWidth: "240px" });
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = {};
        elsRef.current = {};
      }
    };
  }, []);

  // 지역 필터
  useEffect(() => {
    const gl = glRef.current;
    const map = mapRef.current;
    if (!gl || !map || !ready) return;
    const visible = shownIds ? shownIds.split(",") : [];
    LANDS.forEach((l) => {
      const marker = markersRef.current[l.id];
      if (!marker) return;
      if (visible.includes(l.id)) marker.addTo(map);
      else marker.remove();
    });
    const pts = LANDS.filter((l) => visible.includes(l.id));
    if (region === "전체") {
      map.fitBounds(KOREA_BOUNDS, { padding: 24, duration: 700 });
    } else if (pts.length === 1) {
      map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 11, duration: 800 });
    } else if (pts.length > 1) {
      const b = new gl.LngLatBounds();
      pts.forEach((l) => b.extend([l.lng, l.lat]));
      map.fitBounds(b, { padding: 60, maxZoom: 11, duration: 800 });
    }
  }, [shownIds, region, ready]);

  // 활성 매물 강조 + 팝업
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    Object.entries(elsRef.current).forEach(([id, el]) => {
      el.classList.toggle("lm-pin--active", id === active?.id);
    });
    if (active && popupRef.current) {
      popupRef.current.setLngLat([active.lng, active.lat]).setHTML(popupHtml(active)).addTo(map);
      map.panTo([active.lng, active.lat], { duration: 500 });
    } else {
      popupRef.current?.remove();
    }
  }, [active, ready]);

  // 베이스맵 / 지적도 토글
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !HAS_VW) return;
    const set = (id: string, v: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
    };
    set("base-l", mode === "map");
    set("sat-l", mode === "sat");
    set("hybrid-l", mode === "sat");
    set("cad-l", cadastral);
  }, [mode, cadastral, ready]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {regions.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                region === r ? "bg-brand text-white" : "bg-sand text-foreground/60 hover:bg-black/5"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="relative">
          <div
            ref={mapEl}
            className={`h-[460px] w-full overflow-hidden rounded-2xl border border-black/5 shadow-sm sm:h-[560px] ${
              mode === "map" ? "lm-muted" : ""
            }`}
            aria-label="매물 토지 지도"
          />
          {!ready && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-sand/40 text-sm text-foreground/40">
              지도 불러오는 중…
            </div>
          )}
          {/* 레이어 전환 (V-World 사용 시) */}
          {HAS_VW && (
            <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
              <div className="flex rounded-full border border-white/60 bg-white/70 p-0.5 text-xs font-semibold shadow-lg ring-1 ring-black/5 backdrop-blur-md">
                <button
                  onClick={() => setMode("map")}
                  className={`rounded-full px-3.5 py-1.5 transition ${
                    mode === "map" ? "bg-brand text-white shadow" : "text-foreground/70 hover:text-foreground"
                  }`}
                >
                  지도
                </button>
                <button
                  onClick={() => setMode("sat")}
                  className={`rounded-full px-3.5 py-1.5 transition ${
                    mode === "sat" ? "bg-brand text-white shadow" : "text-foreground/70 hover:text-foreground"
                  }`}
                >
                  위성
                </button>
              </div>
              <button
                onClick={() => setCadastral((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md transition ${
                  cadastral
                    ? "border-brand bg-brand text-white"
                    : "border-white/60 bg-white/70 text-foreground/70 ring-1 ring-black/5 hover:text-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${cadastral ? "bg-white" : "bg-foreground/30"}`} />
                지적도
              </button>
            </div>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-foreground/40">
          핀을 누르면 매물 정보가 열립니다 · {HAS_VW ? "지도 © 국토교통부 V-World" : "지도 © OpenStreetMap"}
        </p>
      </div>

      {/* 목록 */}
      <div className="space-y-3 lg:max-h-[620px] lg:overflow-y-auto lg:pr-1">
        {shown.map((l) => (
          <Link
            key={l.id}
            href={`/land/${l.id}`}
            onMouseEnter={() => setActive(l)}
            className={`flex gap-3 overflow-hidden rounded-xl border p-3 transition ${
              active?.id === l.id ? "border-brand bg-brand/5 shadow-sm" : "border-black/5 bg-white hover:border-black/15"
            }`}
          >
            <div
              className="h-[76px] w-[100px] shrink-0 rounded-lg bg-cover bg-center"
              style={{ backgroundImage: `url(${landImage(l)})` }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-brand">{l.region}</p>
                  <p className="truncate font-bold leading-tight">{l.title}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold">{eok(landTotal(l))}</p>
                  <p className="text-[11px] text-foreground/40">{l.areaPy}평</p>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {l.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-full bg-sand px-2 py-0.5 text-[10px] text-foreground/55">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
