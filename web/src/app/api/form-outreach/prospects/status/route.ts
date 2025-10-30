import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ error: "missing tenant id" }, { status: 400 });
    }
    const { prospect_ids, status } = await req.json();

    if (!Array.isArray(prospect_ids) || prospect_ids.length === 0) {
      return NextResponse.json(
        { error: "prospect_ids required" },
        { status: 400 }
      );
    }
    const st =
      typeof status === "string" && status.trim() ? status.trim() : "sent";

    const sb = await supabaseServer();
    const { error } = await sb
      .from("form_prospects")
      .update({ status: st })
      .in("id", prospect_ids)
      .eq("tenant_id", tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: prospect_ids.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
