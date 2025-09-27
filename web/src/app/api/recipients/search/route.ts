// web/src/app/api/recipients/search/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();

    // 認証
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // テナント
    const { data: prof, error: pe } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (pe) return NextResponse.json({ error: pe.message }, { status: 400 });
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // クエリパラメータ
    const url = new URL(req.url);
    const active = url.searchParams.get("active");

    // 取得
    let qb = supabase
      .from("recipients")
      .select(
        "id, name, email, gender, region, birthday, job_category_large, job_category_small, is_active"
      )
      .eq("tenant_id", tenantId);

    if (active === "1") {
      qb = qb.eq("is_active", true);
    }

    const { data, error } = await qb;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "internal error" },
      { status: 500 }
    );
  }
}
