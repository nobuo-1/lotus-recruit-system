// web/src/app/api/campaigns/[id]/sent/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } // ← params は Promise。必ず await する
) {
  try {
    const { id } = await ctx.params;

    const supabase = await supabaseServer();

    // 認証
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return NextResponse.json({ ids: [] });

    // テナント取得
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();

    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId) return NextResponse.json({ ids: [] });

    // 予約済み/送信済み/キュー中を除外対象として取得
    const { data, error } = await supabase
      .from("deliveries")
      .select("recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", id)
      .in("status", ["scheduled", "queued", "sent"]);

    if (error) return NextResponse.json({ ids: [] });

    const ids = Array.from(
      new Set((data ?? []).map((r: any) => r.recipient_id))
    );
    return NextResponse.json({ ids });
  } catch {
    return NextResponse.json({ ids: [] });
  }
}
