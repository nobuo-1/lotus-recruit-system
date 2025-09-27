// web/src/app/api/recipients/import/route.ts
import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { supabaseServer } from "@/lib/supabaseServer";

type CsvRow = {
  email?: string;
  name?: string;
  region?: string;
  job_type?: string;
};

// 小さなメールバリデータ（最低限）
function isValidEmail(s: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

export async function POST(req: Request) {
  try {
    // 1) 認証確認
    const supabase = await supabaseServer();
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 2) フォームからCSVファイル取得
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "file required ('multipart/form-data' with field name 'file')",
        },
        { status: 400 }
      );
    }
    const csvText = await file.text();
    if (!csvText.trim()) {
      return NextResponse.json({ error: "empty file" }, { status: 400 });
    }

    // 3) CSVをパース（ヘッダは大小・空白を吸収）
    const rows = parse(csvText, {
      columns: (h: string[]) => h.map((x) => x.toLowerCase().trim()),
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "no rows" }, { status: 400 });
    }

    // 4) tenant_id を取得（rpc と profiles の両取りで堅牢化）
    let tenant_id: string | null = null;

    // (a) RPC: current_tenant_id()（作成済み前提）
    try {
      const { data: ti } = await supabase.rpc("current_tenant_id");
      if (ti) tenant_id = ti as unknown as string;
    } catch {
      /* noop */
    }

    // (b) fallback: profiles から読む
    if (!tenant_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", userId)
        .maybeSingle();
      tenant_id = (prof as any)?.tenant_id ?? null;
    }

    if (!tenant_id) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    // 5) 正規化・重複排除
    const seen = new Set<string>();
    const payload: {
      tenant_id: string;
      email: string;
      name: string | null;
      region: string | null;
      job_type: string | null;
    }[] = [];
    let skipped = 0;

    for (const r of rows) {
      const email = String(r.email ?? "")
        .toLowerCase()
        .trim();
      if (!email || !isValidEmail(email)) {
        skipped++;
        continue;
      }
      if (seen.has(email)) {
        skipped++;
        continue;
      }
      seen.add(email);

      payload.push({
        tenant_id,
        email,
        name: r.name?.toString().trim() || null,
        region: r.region?.toString().trim() || null,
        job_type: r.job_type?.toString().trim() || null,
      });
    }

    if (payload.length === 0) {
      return NextResponse.json({ error: "no valid rows" }, { status: 400 });
    }

    // 6) upsert（テナント＋メールでユニーク）
    const { error } = await supabase
      .from("recipients")
      .upsert(payload, { onConflict: "tenant_id,email" });

    if (error) {
      // 代表的なDBエラーのヒント
      // - "Could not find the 'job_type'..." → recipients テーブルに job_type 列が無い（列追加 & pg_notify('pgrst','reload schema')）
      // - "new row violates row-level security policy" → RLSポリシー不足
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, inserted: payload.length, skipped });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "internal error" },
      { status: 500 }
    );
  }
}
