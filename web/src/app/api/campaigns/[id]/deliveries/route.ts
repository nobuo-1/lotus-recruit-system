// src/app/api/campaigns/[id]/deliveries/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type DeliveryRow = {
  id: string;
  recipient_id: string;
  status: string; // "scheduled" | "queued" | "sent" | "cancelled" など
  scheduled_at: string | null;
  sent_at: string | null;
};

type RecipientInfo = {
  id: string;
  name: string | null;
  email: string | null;
  gender: "male" | "female" | null;
  region: string | null;
  job_category_large: string | null;
  job_category_small: string | null;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } // Next.js 15: params は Promise
) {
  try {
    const { id } = await ctx.params;
    const supabase = await supabaseServer();

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: prof, error: pe } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (pe) return NextResponse.json({ error: pe.message }, { status: 400 });

    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    const { data: dels, error: de } = await supabase
      .from("deliveries")
      .select("id, recipient_id, status, scheduled_at, sent_at")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", id)
      .order("sent_at", { ascending: false })
      .order("scheduled_at", { ascending: false });

    if (de) return NextResponse.json({ error: de.message }, { status: 400 });

    const delsData = (dels ?? []) as DeliveryRow[];

    const ids = Array.from(new Set(delsData.map((d) => d.recipient_id)));
    const detail: Record<string, RecipientInfo | undefined> = {};
    if (ids.length) {
      const { data: recs } = await supabase
        .from("recipients")
        .select(
          "id, name, email, gender, region, job_category_large, job_category_small"
        )
        .in("id", ids);

      const recsData = (recs ?? []) as RecipientInfo[];
      for (const r of recsData) {
        detail[r.id] = r;
      }
    }

    const rows = delsData.map((d) => ({
      id: d.id,
      status: d.status,
      scheduled_at: d.scheduled_at,
      sent_at: d.sent_at,
      recipient: detail[d.recipient_id] ?? null,
    }));

    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg ?? "internal error" },
      { status: 500 }
    );
  }
}
