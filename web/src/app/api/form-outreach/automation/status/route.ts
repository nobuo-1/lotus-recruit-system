// web/src/app/api/form-outreach/automation/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("form_outreach_auto_runs")
      .select(
        "id, kind, status, target_count, new_prospects, new_rejected, new_similar_sites, started_at, finished_at, last_message, last_progress_at"
      )
      .eq("tenant_id", tenantId)
      .eq("kind", "company_list")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    return NextResponse.json({ run: data ?? null }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
