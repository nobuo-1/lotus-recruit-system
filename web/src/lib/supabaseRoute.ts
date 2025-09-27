// web/src/lib/supabaseRoute.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** API ルート/Server Action 用：Cookie 書き込みOK */
export async function supabaseRoute(): Promise<SupabaseClient> {
  const store = await cookies(); // ← await が必須

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return store.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Route Handler では set が許可される
          store.set({ name, value, ...options } as any);
        },
        remove(name: string, options: CookieOptions) {
          store.set({ name, value: "", ...options, maxAge: 0 } as any);
        },
      },
    }
  );

  return client as unknown as SupabaseClient;
}
