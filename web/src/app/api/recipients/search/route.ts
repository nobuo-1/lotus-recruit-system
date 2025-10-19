// web/src/app/api/recipients/search/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const activeParam = url.searchParams.get("active"); // "1" | "0" | null
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

    // 取得カラム（会社名 & job_categories を追加）
    const selectCols =
      "id,name,company_name,email,phone,gender,region,birthday,job_category_large,job_category_small,job_type,is_active,consent,created_at,job_categories";

    const run = async (
      useDeletedFilter: boolean,
      orderBy: "updated_at" | "id"
    ) => {
      let q = sb
        .from("recipients")
        .select(selectCols, { count: "exact" })
        .eq("tenant_id", tenant_id);
      if (useDeletedFilter) q = q.eq("is_deleted", false);
      if (onlyActive) q = q.eq("is_active", true);
      q = q.order(orderBy as any, { ascending: false }).limit(2000);
      return await q;
    };

    const tries: Array<[boolean, "updated_at" | "id"]> = [
      [true, "updated_at"],
      [true, "id"],
      [false, "updated_at"],
      [false, "id"],
    ];

    for (const [useDel, orderBy] of tries) {
      const { data, error } = await run(useDel, orderBy);
      if (!error) return NextResponse.json({ rows: data ?? [] });

      const msg = error.message ?? "";
      const code = (error as any).code ?? "";
      const isMissingColumn =
        code === "42703" ||
        /column .* does not exist/i.test(msg) ||
        /unknown column/i.test(msg) ||
        /does not exist/i.test(msg) ||
        /is_deleted/.test(msg) ||
        /updated_at/.test(msg);

      if (!isMissingColumn) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ rows: [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
