// web/src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/auth/login",
  "/auth/signup",
  "/api/healthz",
  "/api/auth", // 認証系
  "/api/unsubscribe",
  "/api/ping",

  // ← ここを追加：配信API/受信者検索/スケジュール等は
  //    ログイン前のプリフライトやフロントからの POST をブロックしない
  "/api/campaigns",
  "/api/recipients",
  "/api/email",
];

function hasSupabaseSession(req: NextRequest) {
  const all = req.cookies.getAll();
  const newStyle = all.find((c) => /^sb-[^-]+-auth-token$/.test(c.name));
  const legacy =
    req.cookies.get("sb-access-token") || req.cookies.get("sb-refresh-token");
  return Boolean(newStyle || legacy);
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // API は CORS/プリフライトの都合もあるので prefix で緩く許可
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (!isPublic && !hasSupabaseSession(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// _next, 静的ファイルを除外
export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
