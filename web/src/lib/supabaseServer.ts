// src/lib/supabaseServer.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * App Router の Route Handlers / Server Components で使う Supabase クライアント。
 * Cookie は next/headers の cookies() を経由して読み書き（不可環境では no-op）。
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  // cookies() が Promise | 非Promise どちらでも安全に扱う
  const cookieStore = (await (cookies() as any)) as {
    get?: (name: string) => { value: string } | undefined;
    set?: (opts: { name: string; value: string } & CookieOptions) => void;
  };

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore?.get?.(name)?.value;
      },
      set(name: string, value: string, options?: CookieOptions) {
        try {
          cookieStore?.set?.({ name, value, ...(options ?? {}) });
        } catch {
          // 読み取り専用環境（Server Component など）では無視
        }
      },
      remove(name: string, options?: CookieOptions) {
        try {
          cookieStore?.set?.({
            name,
            value: "",
            ...(options ?? {}),
            maxAge: 0,
          });
        } catch {
          // 読み取り専用環境では無視
        }
      },
    },
  }) as unknown as SupabaseClient;
}
