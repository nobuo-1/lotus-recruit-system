import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = [
  "/auth/login",
  "/auth/signup",
  "/api/healthz",
  "/api/auth",
  "/api/unsubscribe",
];

// Supabase(SSR)のクッキーを検出（新旧どちらの名前でもOK）
function hasSupabaseSession(req: NextRequest) {
  const all = req.cookies.getAll();
  // 新形式: sb-<projectRef>-auth-token
  const newStyle = all.find((c) => /^sb-[^-]+-auth-token$/.test(c.name));
  // 旧形式の保険
  const legacy =
    req.cookies.get("sb-access-token") || req.cookies.get("sb-refresh-token");
  return Boolean(newStyle || legacy);
}

export function middleware(req: NextRequest) {
  const isPublic = PUBLIC.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!isPublic && !hasSupabaseSession(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
