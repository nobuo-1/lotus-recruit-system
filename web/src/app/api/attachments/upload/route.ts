// web/src/app/api/attachments/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "email_attachments";

/** Supabase Storage の “Invalid key” を回避するための安全なファイル名生成 */
function sanitizeFileName(name: string) {
  const base = (name || "file").normalize("NFKC");
  const dot = base.lastIndexOf(".");
  const rawStem = dot > 0 ? base.slice(0, dot) : base;
  const rawExt = dot > 0 ? base.slice(dot + 1) : "";

  // ステムは [A-Za-z0-9._-] 以外を _
  const stem = rawStem
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  // 拡張子は英数のみ（念のため）
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

  // 長すぎるとS3側で嫌がられる場合があるので短縮
  const safeStem = (stem || "file").slice(0, 80);
  const safe = ext ? `${safeStem}.${ext}` : safeStem;
  return safe;
}

async function ensureBucket() {
  const admin = supabaseAdmin();
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  await admin.storage
    .createBucket(BUCKET, {
      public: false,
      fileSizeLimit: null,
      allowedMimeTypes: null,
    })
    .catch(() => void 0);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
export async function HEAD() {
  return new NextResponse(null, { status: 405 });
}

/**
 * POST /api/attachments/upload?type=mail|campaign&id=<uuid>
 * body: FormData で files を複数
 */
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!type || !id || !["mail", "campaign"].includes(type)) {
      return NextResponse.json(
        { error: "type と id は必須です（typeは mail|campaign）" },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 所有確認
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    if (type === "mail") {
      const { data: m, error } = await sb
        .from("mails")
        .select("id, tenant_id")
        .eq("id", id)
        .maybeSingle();
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
      if (!m)
        return NextResponse.json({ error: "mail not found" }, { status: 404 });
      if ((m as any).tenant_id && (m as any).tenant_id !== tenantId)
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    } else {
      const { data: c, error } = await sb
        .from("campaigns")
        .select("id, tenant_id")
        .eq("id", id)
        .maybeSingle();
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
      if (!c)
        return NextResponse.json(
          { error: "campaign not found" },
          { status: 404 }
        );
      if ((c as any).tenant_id !== tenantId)
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    const files: File[] = form.getAll("files").filter(Boolean) as File[];
    if (!files.length)
      return NextResponse.json({ error: "files が空です" }, { status: 400 });

    await ensureBucket();

    const admin = supabaseAdmin();
    const uploaded: {
      file_name: string;
      file_path: string;
      mime_type: string;
      size_bytes: number;
    }[] = [];

    for (const f of files) {
      const safeName = sanitizeFileName(f.name || "unnamed");
      // 二重スラッシュなどを避けつつシンプルなASCIIパスに
      const path = `${type}/${id}/${Date.now()}_${safeName}`;

      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, f, {
          contentType: f.type || "application/octet-stream",
          upsert: false,
        });

      if (upErr) {
        return NextResponse.json(
          { error: `upload failed: ${upErr.message}` },
          { status: 400 }
        );
      }

      uploaded.push({
        file_name: f.name || "unnamed", // 元の表示名はそのまま保持
        file_path: path, // 実際に保存した安全キー
        mime_type: f.type || "application/octet-stream",
        size_bytes: f.size ?? 0,
      });
    }

    if (type === "mail") {
      const { error } = await admin.from("mail_attachments").insert(
        uploaded.map((x) => ({
          mail_id: id,
          file_path: x.file_path,
          file_name: x.file_name,
          mime_type: x.mime_type,
          size_bytes: x.size_bytes,
        }))
      );
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await admin.from("campaign_attachments").insert(
        uploaded.map((x) => ({
          campaign_id: id,
          file_path: x.file_path,
          file_name: x.file_name,
          mime_type: x.mime_type,
          size_bytes: x.size_bytes,
        }))
      );
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, items: uploaded });
  } catch (e: any) {
    console.error("POST /api/attachments/upload error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
