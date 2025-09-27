// web/src/app/api/recipients/search/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * GET /api/recipients/search?active=0|1
 * - active=1 のときだけ is_active=true を絞り込み
 * - active=0 または未指定は全件（テナント内）
 * 返却列：UIで使う全項目（phone/consent を含む）
 */
export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();

    // 認証
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return NextResponse.json({ rows: [] });

    // テナント
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();

    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId) return NextResponse.json({ rows: [] });

    const url = new URL(req.url);
    const active = url.searchParams.get("active"); // "1" のときだけ active を絞る

    let q = supabase
      .from("recipients")
      .select(
        // ← 電話/consent を入れる
        "id,name,email,phone,gender,region,birthday,job_category_large,job_category_small,job_type,is_active,consent"
      )
      .eq("tenant_id", tenantId);

    if (active === "1") {
      q = q.eq("is_active", true);
    }

    // 並び順は任意（created_at が無ければ名前）
    const { data, error } = await q;
    if (error) return NextResponse.json({ rows: [] });

    return NextResponse.json({ rows: data ?? [] });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
