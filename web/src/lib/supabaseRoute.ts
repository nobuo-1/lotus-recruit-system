// src/lib/supabaseRoute.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** API ルート/Server Action 用：Cookie 書き込みOK（環境により no-op フォールバック） */
export async function supabaseRoute(): Promise<SupabaseClient> {
  // cookies() が Promise の型でも同期値でも、await で安全に吸収
  const store = (await (cookies() as any)) as {
    get?: (name: string) => { value: string } | undefined;
    set?: (opts: { name: string; value: string } & CookieOptions) => void;
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return store?.get?.(name)?.value;
        },
        set(name: string, value: string, options?: CookieOptions) {
          try {
            store?.set?.({ name, value, ...(options ?? {}) });
          } catch {
            // 読み取り専用環境では無視（no-op）
          }
        },
        remove(name: string, options?: CookieOptions) {
          try {
            // delete 相当：空値 + maxAge=0
            store?.set?.({ name, value: "", ...(options ?? {}), maxAge: 0 });
          } catch {
            // 読み取り専用環境では無視（no-op）
          }
        },
      },
    }
  ) as unknown as SupabaseClient;
}
