import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* 배포 빌드를 개발 서버와 나란히 돌려 보기 위한 출력 폴더 분리.
     평소에는 .next 그대로다. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  /* 서버 함수 본문 기본 한도는 1MB — 채용 사이트 지원 폼의 이력서가 여기서 잘린다.
     Vercel 요청 한도가 4.5MB 라 그 아래로 둔다. 후보자 서랍·후보자 추가는 저장소로 바로 올린다(doc-upload.ts). */
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};

export default nextConfig;
