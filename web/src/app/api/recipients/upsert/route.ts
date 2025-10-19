// web/src/app/api/recipients/upsert/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type JobPair = { large?: string | null; small?: string | null };

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof, error: profErr } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (profErr)
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    const tenant_id = prof?.tenant_id as string | undefined;
    if (!tenant_id)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // 受け取り
    const id: string | undefined = body.id;
    const name: string | null = body.name ?? null;
    const email: string = body.email;
    const birthday: string | null = body.birthday ?? null;
    const phone: string | null = body.phone ?? null;
    const region: string | null = body.region ?? null;
    const gender: "male" | "female" | null = body.gender ?? null;
    const company_name: string | null = body.company_name ?? null;

    // 複数職種（配列）を受け取る。無ければ空配列
    const job_categories: JobPair[] = Array.isArray(body.job_categories)
      ? body.job_categories.map((p: any) => ({
          large: p?.large || null,
          small: p?.small || null,
        }))
      : [];

    // 互換用：既存の単一列用にも先頭要素を反映しておく
    const first = job_categories.find((p) => p.large || p.small) || {
      large: body.job_category_large || null,
      small: body.job_category_small || null,
    };

    const payload = {
      tenant_id,
      name,
      email,
      birthday,
      phone,
      region,
      gender,
      company_name,
      job_category_large: first.large || null,
      job_category_small: first.small || null,
      job_type: first.small || null,
      job_categories: job_categories as any,
    };

    if (id) {
      const { error } = await sb
        .from("recipients")
        .update(payload)
        .eq("id", id);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await sb.from("recipients").insert(payload);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
