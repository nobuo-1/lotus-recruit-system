import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await supabaseServer();

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof, error: pe } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (pe) return NextResponse.json({ error: pe.message }, { status: 400 });
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    const { data: dels, error: de } = await supabase
      .from("deliveries")
      .select("id, recipient_id, status, scheduled_at, sent_at")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", params.id)
      .order("sent_at", { ascending: false })
      .order("scheduled_at", { ascending: false });
    if (de) return NextResponse.json({ error: de.message }, { status: 400 });

    const ids = Array.from(
      new Set((dels ?? []).map((d: any) => d.recipient_id))
    );
    let detail: Record<string, any> = {};
    if (ids.length) {
      const { data: recs } = await supabase
        .from("recipients")
        .select(
          "id, name, email, gender, region, job_category_large, job_category_small"
        )
        .in("id", ids);
      for (const r of recs ?? []) detail[r.id] = r;
    }

    const rows = (dels ?? []).map((d: any) => ({
      id: d.id,
      status: d.status,
      scheduled_at: d.scheduled_at,
      sent_at: d.sent_at,
      recipient: detail[d.recipient_id] ?? null,
    }));

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "internal error" },
      { status: 500 }
    );
  }
}
