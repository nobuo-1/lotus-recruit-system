import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 必要に応じて他のオプションを追加
  webpack(config) {
    // Next（webpack）側にも alias を明示しておくと安定します
    config.resolve.alias["@"] = path.resolve(__dirname, "src");
    return config;
  },
};

export default nextConfig;
