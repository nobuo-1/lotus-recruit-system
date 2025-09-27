// web/src/app/api/campaigns/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * GET: 一覧 + ステータス計算
 * POST: 新規キャンペーン作成
 *
 * 一覧の status は下記のいずれか：
 *  - "scheduled"         : 未来の予約がある（未消化）
 *  - "queued"            : 予約は無い/全部消化済みだが、配信実績がある（queued/sent）
 *  - "scheduled/queued"  : 未来予約もあり、かつ配信実績もある
 *  - "draft"             : 上記いずれにも該当しない
 */

// ---------- GET ----------
export async function GET() {
  try {
    const sb = await supabaseServer();

    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return NextResponse.json({ rows: [] });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId) return NextResponse.json({ rows: [] });

    // キャンペーン一覧
    const { data: camps, error: ce } = await sb
      .from("campaigns")
      .select("id,name,subject,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (ce) return NextResponse.json({ rows: [] });

    const nowISO = new Date().toISOString();

    // 未来の予約
    const { data: future } = await sb
      .from("email_schedules")
      .select("campaign_id")
      .eq("tenant_id", tenantId)
      .eq("status", "scheduled")
      .gte("scheduled_at", nowISO);
    const hasFuture = new Set((future ?? []).map((r: any) => r.campaign_id));

    // 配信実績（queued/sent）
    const { data: delivered } = await sb
      .from("deliveries")
      .select("campaign_id")
      .eq("tenant_id", tenantId)
      .in("status", ["queued", "sent"]);
    const hasDelivered = new Set(
      (delivered ?? []).map((r: any) => r.campaign_id)
    );

    const rows = (camps ?? []).map((c) => {
      const f = hasFuture.has(c.id);
      const d = hasDelivered.has(c.id);
      const status =
        f && d ? "scheduled/queued" : f ? "scheduled" : d ? "queued" : "draft";
      return {
        id: c.id,
        name: c.name ?? null,
        subject: c.subject ?? null,
        created_at: c.created_at ?? null,
        status,
      };
    });

    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}

// ---------- POST ----------
export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();

    // 認証 & テナント
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: prof, error: pe } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (pe) {
      return NextResponse.json({ error: pe.message }, { status: 400 });
    }
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    // リクエスト
    const body = (await req.json()) as any;
    const name = (body?.name ?? "").trim();
    const subject = (body?.subject ?? "").trim();
    const from_email = (body?.from_email ?? "").trim();
    const body_html = (body?.body_html ?? "").toString();

    if (!name || !subject || !from_email || !body_html) {
      return NextResponse.json(
        { error: "name/subject/from_email/body_html は必須です" },
        { status: 400 }
      );
    }

    // INSERT
    const { data: ins, error: ie } = await sb
      .from("campaigns")
      .insert({
        tenant_id: tenantId,
        name,
        subject,
        from_email,
        body_html,
        status: "draft",
      })
      .select("id")
      .single();

    if (ie) {
      return NextResponse.json({ error: ie.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: ins?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}
