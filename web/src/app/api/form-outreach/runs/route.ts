// web/src/app/api/form-outreach/runs/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = 40;
  const offset = (page - 1) * limit;

  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("form_outreach_runs")
    .select("id, created_at, kind, status, note")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ rows: [] });
  return NextResponse.json({ rows: data ?? [] });
}
