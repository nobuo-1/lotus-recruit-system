// web/src/app/auth/login/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password required" },
      { status: 400 }
    );
  }

  // 応答（ここに Set-Cookie が書かれる）
  const res = NextResponse.json({ ok: true });

  // ★ @supabase/ssr@0.7 の型に合わせて getAll / setAll を実装
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // NextRequest の cookies からすべて読み出し
          return req.cookies.getAll().map((c) => ({
            name: c.name,
            value: c.value,
          }));
        },
        setAll(cookies) {
          // NextResponse 側へまとめて書き出し
          for (const { name, value, options } of cookies) {
            res.cookies.set({ name, value, ...(options ?? {}) });
          }
        },
      },
    }
  );

  // 念のため既存のセッションを破棄（古い Refresh Token を掃除）
  try {
    await supabase.auth.signOut();
  } catch {
    /* noop */
  }

  // サーバ側でサインイン → Supabase が res に Set-Cookie を付ける
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return res;
}
