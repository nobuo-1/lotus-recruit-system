// web/src/app/api/job-boards/runs/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SHARED_RESEARCH_TENANT_ID } from "@/server/job-boards/sharedResearch";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = 40;
  const offset = (page - 1) * limit;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("job_board_runs")
    .select("id, site, status, started_at, finished_at, error")
    .eq("tenant_id", SHARED_RESEARCH_TENANT_ID)
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ rows: [] });
  return NextResponse.json({ rows: data ?? [] });
}
