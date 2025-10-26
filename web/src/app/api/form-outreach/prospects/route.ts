// web/src/app/api/form-outreach/prospects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function sizeBucket(v: string | null): "small" | "mid" | "large" | "" {
  if (!v) return "";
  // 数値を含んでいれば人数で判定
  const m = v.match(/\d+/g);
  const n = m ? Number(m[m.length - 1]) : NaN;
  if (!Number.isNaN(n)) {
    if (n <= 49) return "small";
    if (n <= 249) return "mid";
    return "large";
  }
  // 日本語文字列での簡易判定
  if (v.includes("小")) return "small";
  if (v.includes("中")) return "mid";
  if (v.includes("大")) return "large";
  return "";
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const industry = searchParams.get("industry") || "";
  const size = (searchParams.get("size") || "") as
    | ""
    | "small"
    | "mid"
    | "large";

  // まずベース 300 件まで取得（UI 用）
  let reqSb = sb
    .from("form_prospects")
    .select(
      "id, company_name, website, contact_email, contact_form_url, industry, company_size, created_at"
    )
    .eq("tenant_id", u.user.id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (q) {
    // company_name or website に部分一致
    reqSb = reqSb.ilike("company_name", `%${q}%`).or(`website.ilike.%${q}%`);
  }
  if (industry) reqSb = reqSb.eq("industry", industry);

  const { data, error } = await reqSb;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []).filter((r) => {
    if (!size) return true;
    return sizeBucket(r.company_size || "") === size;
  });

  return NextResponse.json({ rows });
}
