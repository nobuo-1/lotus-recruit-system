// web/src/lib/supabaseServer.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** RSC/ページ用：Cookie 書き込みは no-op */
export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies(); // ← Next.js 15 では await 必須

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return store.get(name)?.value;
        },
        // RSC では Cookie を変更しない
        set(_name: string, _value: string, _options: CookieOptions) {},
        remove(_name: string, _options: CookieOptions) {},
      },
    }
  );

  // TS2589（型が深すぎ）回避のためキャスト
  return client as unknown as SupabaseClient;
}
