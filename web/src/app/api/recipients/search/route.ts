// web/src/app/api/recipients/search/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const activeParam = url.searchParams.get("active"); // "1" or "0" or null
    const onlyActive = activeParam === "1";

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenant_id = prof?.tenant_id as string | undefined;
    if (!tenant_id)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // 共通のSELECT列
    const selectCols =
      "id,name,email,phone,gender,region,birthday,job_category_large,job_category_small,job_type,is_active,consent";

    // クエリビルダー（withDeletedFilter=true で is_deleted=false を付与）
    const buildQuery = (withDeletedFilter: boolean) => {
      let q = sb
        .from("recipients")
        .select(selectCols, { count: "exact" })
        .eq("tenant_id", tenant_id);
      if (withDeletedFilter) q = q.eq("is_deleted", false);
      if (onlyActive) q = q.eq("is_active", true);
      return q.order("updated_at", { ascending: false }).limit(2000);
    };

    // まずは is_deleted=false 付きでトライ
    let { data, error } = await buildQuery(true);

    // 列が無い環境では 42703（undefined_column）等になるのでフォールバック
    if (
      error &&
      (error.code === "42703" || (error.message ?? "").includes("is_deleted"))
    ) {
      const r2 = await buildQuery(false);
      if (r2.error)
        return NextResponse.json({ error: r2.error.message }, { status: 400 });
      return NextResponse.json({ rows: r2.data ?? [] });
    }

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
