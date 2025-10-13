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

    let q = sb
      .from("recipients")
      .select(
        "id,name,email,phone,gender,region,birthday,job_category_large,job_category_small,job_type,is_active,consent",
        { count: "exact" }
      )
      .eq("tenant_id", tenant_id)
      .eq("is_deleted", false); // ← 削除済みは常に除外

    if (onlyActive) q = q.eq("is_active", true);

    const { data, error } = await q
      .order("updated_at", { ascending: false })
      .limit(2000);

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
