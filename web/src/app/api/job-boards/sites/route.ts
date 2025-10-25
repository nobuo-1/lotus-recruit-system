// web/src/app/api/job-boards/sites/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await supabaseServer();
  // results から distinct 抜く（site / site_name / site_code どれがあるか順に確認）
  const tryCols = ["site", "site_name", "site_code", "site_key"];
  for (const c of tryCols) {
    const { data, error } = await sb
      .from("job_board_results")
      .select(`${c}`)
      .not(c as any, "is", null)
      .limit(1);
    if (!error && (data ?? []).length > 0) {
      const { data: all } = await sb
        .from("job_board_results")
        .select(`${c}`)
        .not(c as any, "is", null);
      const sites = Array.from(
        new Set((all ?? []).map((r: any) => r[c]))
      ).sort();
      return NextResponse.json({ sites });
    }
  }
  return NextResponse.json({ sites: [] });
}
