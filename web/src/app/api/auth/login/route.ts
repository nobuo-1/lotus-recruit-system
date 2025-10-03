// web/src/app/api/auth/login/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * email / password でサインインし、Supabase の Cookie をサーバ側で発行する。
 * フロントはこのエンドポイントに POST するだけでOK。
 */
export async function POST(req: NextRequest) {
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

  // 応答（ここに Set-Cookie が書かれる）
  const res = NextResponse.json({ ok: true });

  // @supabase/ssr@0.7 仕様の cookies(getAll/setAll) で橋渡し
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  // 古いトークンを掃除（refresh_token_already_used 回避）
  try {
    await supabase.auth.signOut();
  } catch {
    /* noop */
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // res に sb- 系 Cookie が積まれて返る
  return res;
}
