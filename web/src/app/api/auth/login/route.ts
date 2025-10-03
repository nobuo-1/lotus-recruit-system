// web/src/app/api/auth/login/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * email / password を受け取り、Supabase セッション Cookie を発行する。
 * 成功時は 200 { ok: true } を返し、Set-Cookie で sb- 系 Cookie を設定。
 */
export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !/^https?:\/\//.test(url) || !anon) {
      console.error("[auth/login] invalid env", { url: !!url, anon: !!anon });
      return NextResponse.json(
        { error: "Supabase env is missing or invalid" },
        { status: 500 }
      );
    }

    const { email, password } = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password required" },
        { status: 400 }
      );
    }

    // 応答オブジェクト(ここに Set-Cookie を書く)
    const res = NextResponse.json({ ok: true });

    // @supabase/ssr@0.7 の getAll/setAll で Cookie を橋渡し
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return req.cookies.getAll().map((c) => ({
            name: c.name,
            value: c.value,
          }));
        },
        setAll(cookies) {
          for (const { name, value, options } of cookies) {
            res.cookies.set({ name, value, ...(options ?? {}) });
          }
        },
      },
    });

    // 既存セッションが壊れていても必ず前掃除
    try {
      await supabase.auth.signOut();
    } catch {
      /* noop */
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("[auth/login] signIn error", error);
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return res;
  } catch (e) {
    console.error("[auth/login] fatal", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
