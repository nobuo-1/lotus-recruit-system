// web/src/app/api/recipients/delete/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * { id } または { ids } を受け取り、is_deleted=true にするソフト削除。
 * is_active は配信対象切替用として存続（触らない）。
 * 成功時: { ok: true, count: <更新件数> }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      ids?: string[];
    };

    const ids = Array.isArray(body.ids)
      ? body.ids.filter(Boolean)
      : body.id
      ? [body.id]
      : [];
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "id or ids required" },
        { status: 400 }
      );
    }

    // 認証＆テナント取得
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenant_id = prof?.tenant_id as string | undefined;
    if (!tenant_id)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // RLSの影響を避けるため admin クライアントで更新（tenant_id フィルタは厳守）
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("recipients")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenant_id)
      .in("id", ids)
      .select("id");

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, count: (data ?? []).length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
