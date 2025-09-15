import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Next.js 15 対応版:
 * - cookies() は Promise なので await が必要
 * - set/remove は RequestCookies の API に合わせて set/delete を使用
 */
export const supabaseServer = async () => {
  const cookieStore = await cookies(); // ← ここがポイント（await）

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          cookieStore.set({ name, value, ...options });
        },
        remove: (name: string, options: CookieOptions) => {
          // Next.js 15 では delete が素直
          cookieStore.delete({ name, ...options });
        },
      },
    }
  );
};
