// web/src/lib/supabaseServer.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieValueLike = { value: string };
type StoreLike = {
  get?: (name: string) => CookieValueLike | undefined;
  set?: (opts: { name: string; value: string } & CookieOptions) => void;
};

function isPromise<T>(v: unknown): v is Promise<T> {
  return typeof (v as { then?: unknown }).then === "function";
}
function hasGet(x: unknown): x is Required<Pick<StoreLike, "get">> {
  return typeof (x as StoreLike)?.get === "function";
}
function hasSet(x: unknown): x is Required<Pick<StoreLike, "set">> {
  return typeof (x as StoreLike)?.set === "function";
}

/**
 * Route Handlers / Server Components 用の Supabase クライアント。
 * - 環境変数の読込は関数内に遅延（ビルド時評価を回避）
 * - Cookie は next/headers 経由（書込不可環境では no-op）
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const raw = cookies() as unknown;
  const store: unknown = isPromise(raw) ? await raw : raw;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is missing or invalid (must start with https://)"
    );
  }
  if (!anon) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
  }

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return hasGet(store) ? store.get(name)?.value : undefined;
      },
      set(name: string, value: string, options?: CookieOptions) {
        if (hasSet(store)) {
          store.set({ name, value, ...(options ?? {}) });
        }
      },
      remove(name: string, options?: CookieOptions) {
        if (hasSet(store)) {
          store.set({ name, value: "", ...(options ?? {}), maxAge: 0 });
        }
      },
    },
  }) as unknown as SupabaseClient;
}
