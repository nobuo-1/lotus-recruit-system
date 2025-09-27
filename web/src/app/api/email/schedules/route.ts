// web/src/app/api/email/schedules/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * rows: 予約中のみ（未来かつ status='scheduled'）
 *  - id
 *  - campaign_id
 *  - campaign_title
 *  - scheduled_at
 *  - status
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();

    // 認証
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return NextResponse.json({ rows: [] });

    // テナント
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId) return NextResponse.json({ rows: [] });

    const nowISO = new Date().toISOString();

    // 未来 & scheduled のみ
    const { data: sch } = await supabase
      .from("email_schedules")
      .select("id, campaign_id, scheduled_at, status, tenant_id")
      .eq("tenant_id", tenantId)
      .eq("status", "scheduled")
      .gte("scheduled_at", nowISO)
      .order("scheduled_at", { ascending: true });

    const schedules = sch ?? [];
    if (schedules.length === 0) return NextResponse.json({ rows: [] });

    const campIds = Array.from(new Set(schedules.map((s) => s.campaign_id)));
    const { data: camps } = await supabase
      .from("campaigns")
      .select("id, name, tenant_id")
      .in("id", campIds)
      .eq("tenant_id", tenantId);

    const id2name = new Map<string, string>();
    (camps ?? []).forEach((c) => id2name.set(c.id, c.name ?? ""));

    const rows = schedules
      .filter((s) => id2name.has(s.campaign_id as string))
      .map((s) => ({
        id: s.id as string,
        campaign_id: s.campaign_id as string,
        campaign_title: id2name.get(s.campaign_id as string) ?? null,
        scheduled_at: (s.scheduled_at as string) ?? null,
        status: (s.status as string) ?? null,
      }));

    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
