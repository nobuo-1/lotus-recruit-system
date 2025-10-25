// web/src/app/api/job-boards/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type Mode = "weekly" | "monthly";
type Metric = "jobs" | "candidates";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = (body?.mode as Mode) || "weekly";
    const metric = (body?.metric as Metric) || "jobs";
    const range = String(body?.range || (mode === "weekly" ? "26w" : "12m"));

    let sites: string[] = Array.isArray(body?.sites) ? body.sites : [];
    let large: string[] = Array.isArray(body?.large) ? body.large : [];
    let small: string[] = Array.isArray(body?.small) ? body.small : [];
    let age: string[] = Array.isArray(body?.age) ? body.age : [];
    let emp: string[] = Array.isArray(body?.emp) ? body.emp : [];
    let sal: string[] = Array.isArray(body?.sal) ? body.sal : [];

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();

    // テナント絞り込み
    let tenantId: string | null = null;
    if (u?.user) {
      const { data: prof } = await sb
        .from("profiles")
        .select("tenant_id")
        .eq("id", u.user.id)
        .maybeSingle();
      tenantId = (prof?.tenant_id as string) || null;
    }

    // 情報スキーマでサイト列の検出
    const { data: siteColRes } = await sb.rpc("introspect_column_exists", {
      p_schema: "public",
      p_table: "job_board_results",
      p_column: "site_key",
    });

    let siteCol = "site";
    if (
      Array.isArray(siteColRes) ? siteColRes?.[0]?.exists : siteColRes?.exists
    ) {
      siteCol = "site_key";
    } else {
      // site があるか
      const { data: siteColRes2 } = await sb.rpc("introspect_column_exists", {
        p_schema: "public",
        p_table: "job_board_results",
        p_column: "site",
      });
      const ok = Array.isArray(siteColRes2)
        ? siteColRes2?.[0]?.exists
        : siteColRes2?.exists;
      if (!ok) {
        return NextResponse.json(
          { error: "job_board_results に site / site_key がありません。" },
          { status: 400 }
        );
      }
      siteCol = "site";
    }

    // 空配列は「全選択」扱い -> DB 側で ANY 配列に渡すため、null を渡すと全件モード
    const arrOrNull = (a: string[]) => (a.length ? a : null);

    // DB 集計は RPC に委譲（存在しない環境向け fallback つき）
    const { data, error } = await sb.rpc("job_boards_metrics_fallback", {
      p_site_col: siteCol,
      p_mode: mode,
      p_metric: metric,
      p_range: range,
      p_tenant: tenantId,

      p_sites: arrOrNull(sites),
      p_large: arrOrNull(large),
      p_small: arrOrNull(small),
      p_age: arrOrNull(age),
      p_emp: arrOrNull(emp),
      p_sal: arrOrNull(sal),
    });

    if (error) throw error;
    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
