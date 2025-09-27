// web/next.config.ts
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // monorepo 警告の抑制（web/ 配下にロックファイルがある場合）
  outputFileTracingRoot: path.resolve(__dirname, ".."),
};

export default nextConfig;
