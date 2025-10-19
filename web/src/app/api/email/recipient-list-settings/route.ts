// web/src/app/api/email/recipient-list-settings/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * 現在ログイン中ユーザーのテナントに紐づく可視列設定を返す
 * 失敗してもデフォルトで返す（UIを壊さない）
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("app_get_recipient_list_settings");
  if (error) {
    return NextResponse.json(
      { visible_columns: ["name", "email", "region", "created_at"] },
      { status: 200 }
    );
  }
  return NextResponse.json(
    { visible_columns: (data ?? []) as string[] },
    { status: 200 }
  );
}

/**
 * 可視列を保存
 * body: { visible_columns: string[] }
 */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const body = await req.json().catch(() => ({}));
  const cols = Array.isArray(body?.visible_columns) ? body.visible_columns : [];

  const { error } = await sb.rpc("app_set_recipient_list_settings", {
    p_visible_columns: cols,
  });
  if (error) return new NextResponse(error.message, { status: 400 });

  return new NextResponse("ok", { status: 200 });
}
