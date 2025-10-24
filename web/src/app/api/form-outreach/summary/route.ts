// web/src/app/api/form-outreach/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id, is_admin")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;

    if (!tenantId) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    const [{ count: companies }, { count: msgs }, { data: last30 }] =
      await Promise.all([
        sb
          .from("form_outreach_companies")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
        sb
          .from("form_outreach_messages")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
        sb
          .from("form_outreach_jobs")
          .select("status, sent_at, created_at")
          .eq("tenant_id", tenantId)
          .gte(
            "created_at",
            new Date(Date.now() - 30 * 86400_000).toISOString()
          ),
      ]);

    const sent = (last30 ?? []).filter((r: any) => r.status === "sent").length;
    const failed = (last30 ?? []).filter(
      (r: any) => r.status === "failed"
    ).length;
    const queued = (last30 ?? []).filter(
      (r: any) => r.status === "queued"
    ).length;

    return NextResponse.json({
      ok: true,
      metrics: {
        companies: companies ?? 0,
        templates: msgs ?? 0,
        last30: { sent, failed, queued },
      },
    });
  } catch (e: any) {
    console.error("[api.form-outreach.summary] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
