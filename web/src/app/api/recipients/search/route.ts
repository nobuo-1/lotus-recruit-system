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

    // 取得カラム（UIが参照するもののみ）
    const selectCols =
      "id,name,company_name,email,phone,gender,region,birthday,job_category_large,job_category_small,job_type,is_active,consent";

    // クエリを1回実行するヘルパー
    const run = async (
      useDeletedFilter: boolean,
      orderBy: "updated_at" | "id"
    ) => {
      let q = sb
        .from("recipients")
        .select(selectCols, { count: "exact" })
        .eq("tenant_id", tenant_id);
      if (useDeletedFilter) q = q.eq("is_deleted", false); // ← is_deleted があれば使う
      if (onlyActive) q = q.eq("is_active", true);
      q = q.order(orderBy as any, { ascending: false }).limit(2000);
      return await q;
    };

    /**
     * フォールバック順:
     *  1) is_deleted あり + updated_at 並び
     *  2) is_deleted あり + id 並び
     *  3) is_deleted なし + updated_at 並び
     *  4) is_deleted なし + id 並び
     *
     * どこかで成功したらそれを返す。missing column 以外のエラーは即返す。
     */
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

      // 列が無い系のエラーは次のフォールバックへ。それ以外は即返す。
      if (!isMissingColumn) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    // 全て失敗した場合でも 200/空配列で返す（UIが壊れないように）
    return NextResponse.json({ rows: [] });
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
