// web/src/app/api/attachments/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function sanitizeName(name: string) {
  // スラッシュ等は無効・連続空白は _ に
  return (name || "file")
    .replace(/[\/\\]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type"); // "mail" | "campaign"
    const id = url.searchParams.get("id");

    if (type !== "mail" && type !== "campaign") {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    // 認証（ログイン必須）
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const form = await req.formData();
    // フィールド名は "files" を想定（複数OK）
    const files = form
      .getAll("files")
      .map((v) => (v instanceof File ? v : null))
      .filter((v): v is File => !!v);

    if (!files.length) {
      return NextResponse.json({ error: "no files" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const bucket = admin.storage.from("email_attachments");

    const rows: any[] = [];
    for (const file of files) {
      const safe = sanitizeName(file.name);
      const path = `${type}/${id}/${Date.now()}_${safe}`;

      // Storage へアップロード（service key で権限OK）
      const up = await bucket.upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (up.error) {
        return NextResponse.json({ error: up.error.message }, { status: 400 });
      }

      rows.push({
        [`${type}_id`]: id,
        file_path: path,
        file_name: safe,
        mime_type: file.type || null,
        size_bytes: file.size ?? null,
      });
    }

    const table = type === "mail" ? "mail_attachments" : "campaign_attachments";
    const ins = await admin
      .from(table)
      .insert(rows as any[])
      .select("id");
    if (ins.error) {
      return NextResponse.json({ error: ins.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
