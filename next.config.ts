import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* 배포 빌드를 개발 서버와 나란히 돌려 보기 위한 출력 폴더 분리.
     평소에는 .next 그대로다. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
