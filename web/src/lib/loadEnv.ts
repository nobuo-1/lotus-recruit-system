import { loadEnvConfig } from "@next/env";

const globalForEnv = globalThis as typeof globalThis & {
  __lotusEnvLoaded__?: boolean;
};

if (!globalForEnv.__lotusEnvLoaded__) {
  loadEnvConfig(process.cwd());
  globalForEnv.__lotusEnvLoaded__ = true;
}

