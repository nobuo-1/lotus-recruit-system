// web/next.config.ts
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // monorepo 警告の抑制（web/ 配下にロックファイルがある場合）
  outputFileTracingRoot: path.resolve(__dirname, ".."),

  // 本番ビルド時に ESLint エラーで落とさない
  eslint: { ignoreDuringBuilds: true },

  // TypeScript の型エラーでもビルドを通す（必要なければ false に戻してOK）
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
