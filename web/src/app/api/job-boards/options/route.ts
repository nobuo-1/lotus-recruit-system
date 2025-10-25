// web/src/app/api/job-boards/options/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await supabaseServer();
  const { data: sites } = await sb
    .from("job_sites")
    .select("site_key, site_label, is_active")
    .eq("is_active", true)
    .order("site_label");

  // 現在登録済のディメンション値を distinct で返す（空なら既定配列でもOK）
  const dims = async (col: string) =>
    (await sb.from("job_metrics").select(col)).data
      ?.map((r: any) => r[col])
      .filter(Boolean);

  const [age, emp, sal] = await Promise.all([
    dims("age_band"),
    dims("employment_type"),
    dims("salary_band"),
  ]);

  return NextResponse.json({
    sites: (sites ?? []).map((s: any) => ({
      key: s.site_key,
      label: s.site_label,
    })),
    ageBands: Array.from(new Set(age ?? [])).sort(),
    employmentTypes: Array.from(new Set(emp ?? [])).sort(),
    salaryBands: Array.from(new Set(sal ?? [])).sort(),
  });
}
