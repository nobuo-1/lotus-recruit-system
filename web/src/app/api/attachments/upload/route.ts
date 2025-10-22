// web/src/app/api/attachments/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "email_attachments";

async function ensureBucket() {
  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  // 存在しない場合は作成（複数同時実行でも片方が成功すればOK）
  await admin.storage
    .createBucket(BUCKET, {
      public: false,
      fileSizeLimit: null, // 制限なし（必要ならバイト数で設定）
      allowedMimeTypes: null, // 全許可（必要なら絞る）
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
 * Body: FormData(files: File[])  ← 複数添付OK
 * - Storage: email_attachments/{type}/{id}/{ts}_{encodedName}
 * - DB: mail_attachments / campaign_attachments に1行ずつINSERT
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
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 所有権（tenant）の検証：対象がログインユーザーのテナントのものか
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

    if (!tenantId) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

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
      if ((m as any).tenant_id && (m as any).tenant_id !== tenantId) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
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
      if ((c as any).tenant_id !== tenantId) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    const form = await req.formData();
    const files: File[] = form.getAll("files").filter(Boolean) as File[];
    if (!files.length) {
      return NextResponse.json({ error: "files が空です" }, { status: 400 });
    }

    await ensureBucket();

    const admin = supabaseAdmin();
    const uploaded: {
      file_name: string;
      file_path: string;
      mime_type: string;
      size_bytes: number;
    }[] = [];

    // 1ファイルずつ保存
    for (const f of files) {
      const safeName = encodeURIComponent(f.name || "unnamed");
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
        file_name: f.name || "unnamed",
        file_path: path,
        mime_type: f.type || "application/octet-stream",
        size_bytes: f.size ?? 0,
      });
    }

    // DBへ登録
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
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
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
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
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
