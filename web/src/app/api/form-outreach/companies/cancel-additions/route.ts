import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId)
      return NextResponse.json({ error: "missing tenant id" }, { status: 400 });

    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const sb = await supabaseServer();
    const { error, count } = await sb
      .from("form_prospects")
      .delete({ count: "exact" })
      .in("id", ids)
      .eq("tenant_id", tenantId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: count ?? ids.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
