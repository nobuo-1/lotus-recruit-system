export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id ?? null;
    const admin = supabaseAdmin();

    const { count: companyCount } = await admin
      .from("form_prospects")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    const { count: totalMessages } = await admin
      .from("form_outreach_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    const { count: firstContacts } = await admin
      .from("form_outreach_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("step", 1);
    const { count: followups } = await admin
      .from("form_outreach_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("step", 2);

    return NextResponse.json({
      kpi: {
        companyCount: companyCount ?? 0,
        totalMessages: totalMessages ?? 0,
        firstContacts: firstContacts ?? 0,
        followups: followups ?? 0,
      },
    });
  } catch (e: any) {
    console.error("[api.form-outreach.summary]", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
