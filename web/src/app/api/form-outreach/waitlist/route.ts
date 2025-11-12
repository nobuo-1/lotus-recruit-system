// web/src/app/api/form-outreach/waitlist/route.ts
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const items: any[] = Array.isArray(body?.items) ? body.items : [];
    const table = String(body?.table || body?.table_name || "");
    if (!items.length) {
      return NextResponse.json({ error: "items required" }, { status: 400 });
    }

    const sb = await supabaseServer();
    const rows = items.map((it) => ({
      tenant_id: tenantId,
      table_name: table || it.table_name || "unknown",
      prospect_id: it.prospect_id,
      reason: it.reason || "unknown",
      payload: it.payload || null,
    }));

    const { error } = await sb.from("form_outreach_waitlist").insert(rows);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: rows.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
