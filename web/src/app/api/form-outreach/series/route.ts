// web/src/app/api/form-outreach/series/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
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

    const url = new URL(req.url);
    const range = String(url.searchParams.get("range") || "30d");
    const days = range.endsWith("d") ? parseInt(range) : 30;

    const { data, error } = await sb
      .from("form_outreach_messages")
      .select("sent_at")
      .eq("tenant_id", tenantId!)
      .eq("status", "sent")
      .gte("sent_at", new Date(Date.now() - days * 86400000).toISOString());

    if (error) throw error;

    // 日別集計
    const byDay = new Map<string, number>();
    for (const r of data ?? []) {
      const d = (r as any).sent_at;
      if (!d) continue;
      const day = new Date(d).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }
    // 欠損補完
    const out: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000)
        .toISOString()
        .slice(0, 10);
      out.push({ date: day, count: byDay.get(day) || 0 });
    }
    return NextResponse.json({ rows: out });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
