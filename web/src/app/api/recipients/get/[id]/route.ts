// web/src/app/api/recipients/get/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  try {
    const { id } = ctx.params;

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const cols =
      "id,name,email,birthday,phone,region,gender,company_name,job_category_large,job_category_small,job_categories";
    const { data, error } = await sb
      .from("recipients")
      .select(cols)
      .eq("id", id)
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ row: null });

    // ← ここで空なら単一列から補完
    let jc: any[] = Array.isArray((data as any).job_categories)
      ? (data as any).job_categories
      : [];
    if (
      jc.length === 0 &&
      (data.job_category_large || data.job_category_small)
    ) {
      jc = [
        {
          large: data.job_category_large ?? null,
          small: data.job_category_small ?? null,
        },
      ];
    }

    return NextResponse.json({ row: { ...data, job_categories: jc } });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
