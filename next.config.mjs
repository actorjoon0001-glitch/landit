/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 이 앱은 서버 기능이 없는 완전 정적 사이트이므로 정적 export로 빌드합니다.
  // -> Netlify에서 서버리스 함수 배포 없이 단순 정적 호스팅으로 배포됩니다.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
