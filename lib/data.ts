// LANDIT — 매물 토지 및 모듈러주택 데이터 (데모용 목업)
// 실제 서비스에서는 국토부/VWorld/지자체 API 및 자체 DB로 대체됩니다.

export type HouseType = "modular" | "second" | "country";

export interface ModularHouse {
  id: string;
  name: string;
  builder: string;
  areaPy: number; // 전용 평
  bedrooms: number;
  bathrooms: number;
  priceKRW: number; // 시공비(대지 제외)
  buildWeeks: number; // 시공 기간(주)
  style: string;
  color: string; // 시뮬레이션 렌더 색
  roof: "gable" | "flat" | "mono";
  // 사용자 홈플래너 산출물 (선택) — 있으면 절차적 지오메트리 대신 사용
  model?: string; // 실시간 3D 모델 GLB 경로 (예: "/models/nordic-24.glb")
  renders?: string[]; // 실사 렌더 이미지 경로 배열 (갤러리/턴테이블)
}

export interface Land {
  id: string;
  title: string;
  region: string; // 시·군
  address: string;
  // 지도상 정규화 좌표 (0~100), 데모용 자체 지도 기준
  x: number;
  y: number;
  areaPy: number; // 대지 평수
  pricePerPy: number; // 평당가(만원)
  zoning: string; // 용도지역
  slope: "평지" | "완경사" | "급경사";
  road: boolean; // 도로 접함(맹지 여부)
  utilities: { water: boolean; power: boolean; sewage: boolean };
  view: string;
  tags: string[];
  suitableFor: HouseType[];
  lat: number;
  lng: number;
  sunlight: number; // 일조 점수 0~100
  summary: string;
}

export const MODULAR_HOUSES: ModularHouse[] = [
  {
    // 실제 판매 중인 19평 모델 (크림 사이딩 + 박공지붕 + 포치데크)
    id: "m-stay-19",
    name: "Stay 19",
    builder: "LANDIT 파트너",
    areaPy: 19,
    bedrooms: 2,
    bathrooms: 1,
    priceKRW: 95_000_000, // 실판매가 (제조사 공식 판매가 기준)
    buildWeeks: 6,
    style: "클래식 사이딩 포치",
    color: "#efe9dc",
    roof: "gable",
    model: "/models/stay-19.glb",
    renders: ["/img/stay-19-1.webp", "/img/stay-19-2.webp", "/img/stay-19-3.webp"],
  },
  {
    id: "m-nordic-24",
    name: "노르딕 24",
    builder: "모듈하우스코리아",
    areaPy: 24,
    bedrooms: 2,
    bathrooms: 1,
    priceKRW: 132_000_000,
    buildWeeks: 8,
    style: "북유럽 미니멀",
    color: "#e8e4dc",
    roof: "gable",
    model: "/models/nordic-24.glb",
  },
  {
    id: "m-cabin-18",
    name: "우드캐빈 18",
    builder: "그린모듈러",
    areaPy: 18,
    bedrooms: 1,
    bathrooms: 1,
    priceKRW: 96_000_000,
    buildWeeks: 6,
    style: "우드 캐빈",
    color: "#8a6b4f",
    roof: "gable",
  },
  {
    id: "m-cube-32",
    name: "큐브 라이프 32",
    builder: "스마트하우스랩",
    areaPy: 32,
    bedrooms: 3,
    bathrooms: 2,
    priceKRW: 210_000_000,
    buildWeeks: 11,
    style: "모던 큐브",
    color: "#3f4b57",
    roof: "flat",
  },
  {
    id: "m-slope-28",
    name: "슬로프 하우스 28",
    builder: "모듈하우스코리아",
    areaPy: 28,
    bedrooms: 2,
    bathrooms: 2,
    priceKRW: 178_000_000,
    buildWeeks: 10,
    style: "경사지붕 모던",
    color: "#b7c2b0",
    roof: "mono",
  },
];

export const LANDS: Land[] = [
  {
    id: "gapyeong-01",
    title: "북한강 조망 완경사 대지",
    region: "경기 가평",
    address: "경기도 가평군 청평면 호명리 산 12-3",
    x: 34,
    y: 28,
    areaPy: 210,
    pricePerPy: 145,
    zoning: "계획관리지역",
    slope: "완경사",
    road: true,
    utilities: { water: true, power: true, sewage: false },
    view: "북한강 & 산 조망",
    tags: ["강조망", "역세권아님", "농막가능"],
    suitableFor: ["country", "second", "modular"],
    lat: 37.735,
    lng: 127.42,
    sunlight: 88,
    summary:
      "남향 완경사로 일조가 우수하고, 도로에 접해 있어 진입이 편리합니다. 상수도·전기 인입 완료, 오수는 개인정화조 설치가 필요합니다.",
  },
  {
    id: "yangpyeong-02",
    title: "양평 숲세권 평지 텃밭 부지",
    region: "경기 양평",
    address: "경기도 양평군 서종면 문호리 245-1",
    x: 41,
    y: 44,
    areaPy: 160,
    pricePerPy: 210,
    zoning: "보전관리지역",
    slope: "평지",
    road: true,
    utilities: { water: true, power: true, sewage: true },
    view: "숲 & 계곡",
    tags: ["평지", "인프라완비", "서울근접"],
    suitableFor: ["second", "modular"],
    lat: 37.564,
    lng: 127.36,
    sunlight: 79,
    summary:
      "상하수도·전기 모두 인입된 즉시 건축 가능 부지. 평지라 토목 비용이 적고 서울 접근성이 좋아 세컨하우스로 인기가 높습니다.",
  },
  {
    id: "hongcheon-03",
    title: "홍천강 인접 넓은 전원 부지",
    region: "강원 홍천",
    address: "강원도 홍천군 서면 마곡리 501",
    x: 62,
    y: 22,
    areaPy: 340,
    pricePerPy: 78,
    zoning: "계획관리지역",
    slope: "평지",
    road: true,
    utilities: { water: false, power: true, sewage: false },
    view: "강 & 들판",
    tags: ["넓은대지", "저렴", "강근접"],
    suitableFor: ["country", "modular"],
    lat: 37.71,
    lng: 127.71,
    sunlight: 84,
    summary:
      "평당가가 낮아 넓은 마당을 확보할 수 있는 부지. 관정(지하수) 개발과 정화조 설치가 필요하지만 전원생활에 최적입니다.",
  },
  {
    id: "jeju-04",
    title: "제주 중산간 오션뷰 대지",
    region: "제주 서귀포",
    address: "제주특별자치도 서귀포시 안덕면 상천리 산 20",
    x: 20,
    y: 78,
    areaPy: 180,
    pricePerPy: 320,
    zoning: "계획관리지역",
    slope: "완경사",
    road: true,
    utilities: { water: true, power: true, sewage: false },
    view: "바다 & 한라산",
    tags: ["오션뷰", "제주", "프리미엄"],
    suitableFor: ["second", "modular", "country"],
    lat: 33.28,
    lng: 126.35,
    sunlight: 91,
    summary:
      "중산간 남서향 대지로 낮에는 바다, 뒤로는 한라산이 보이는 프리미엄 입지. 제주 세컨하우스 및 스테이 운영에 적합합니다.",
  },
  {
    id: "chungju-05",
    title: "충주호 조망 언덕 부지",
    region: "충북 충주",
    address: "충청북도 충주시 동량면 조동리 산 88",
    x: 52,
    y: 60,
    areaPy: 260,
    pricePerPy: 95,
    zoning: "계획관리지역",
    slope: "급경사",
    road: false,
    utilities: { water: false, power: true, sewage: false },
    view: "충주호 조망",
    tags: ["호수뷰", "맹지주의", "저렴"],
    suitableFor: ["country"],
    lat: 36.99,
    lng: 127.99,
    sunlight: 72,
    summary:
      "충주호가 시원하게 조망되는 언덕이지만 현재 맹지로 진입로 확보가 선행되어야 합니다. 급경사라 토목 검토가 중요합니다.",
  },
  {
    id: "namhae-06",
    title: "남해 다랭이 바다 조망 부지",
    region: "경남 남해",
    address: "경상남도 남해군 남면 홍현리 302-4",
    x: 30,
    y: 90,
    areaPy: 145,
    pricePerPy: 240,
    zoning: "계획관리지역",
    slope: "완경사",
    road: true,
    utilities: { water: true, power: true, sewage: true },
    view: "남해 바다",
    tags: ["오션뷰", "인프라완비", "따뜻한기후"],
    suitableFor: ["second", "modular"],
    lat: 34.71,
    lng: 127.9,
    sunlight: 90,
    summary:
      "남향 바다 조망에 인프라가 완비된 즉시 건축 부지. 온화한 기후로 사계절 세컨하우스로 활용하기 좋습니다.",
  },
];

export function getLand(id: string): Land | undefined {
  return LANDS.find((l) => l.id === id);
}

export function getHouse(id: string): ModularHouse | undefined {
  return MODULAR_HOUSES.find((h) => h.id === id);
}

export function housesForLand(land: Land): ModularHouse[] {
  // 대지 평수의 40% 이내로 앉힐 수 있는 주택만 추천(건폐율 감안 데모)
  const maxFootprint = land.areaPy * 0.4;
  return MODULAR_HOUSES.filter((h) => h.areaPy <= maxFootprint);
}

export const won = (n: number) =>
  new Intl.NumberFormat("ko-KR").format(Math.round(n));

export const eok = (n: number) => {
  const e = n / 100_000_000;
  return e >= 1 ? `${e.toFixed(2)}억원` : `${won(n / 10_000)}만원`;
};

// 대지 총액(평당가는 만원 단위)
export const landTotal = (land: Land) => land.areaPy * land.pricePerPy * 10_000;

// 매물 조망에 맞는 포토리얼 이미지 (Higgsfield 생성)
export function landImage(l: Land): string {
  if (l.view.includes("바다")) return "/img/view-ocean.webp";
  if (l.view.includes("충주호") || l.view.includes("호수")) return "/img/view-lake.webp";
  if (l.view.includes("숲") || l.view.includes("계곡")) return "/img/view-forest.webp";
  return "/img/view-river.webp";
}
