// web/src/app/api/campaigns/[id]/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";

/** 安全JSON（空ボディでもOK） */
async function safeJson<T = any>(req: Request): Promise<T | {}> {
  try {
    if (!req.headers.get("content-length")) return {};
    return (await req.json()) as T;
  } catch {
    return {};
  }
}

/** 送信元設定 */
async function loadSenderConfigForCurrentUser() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user) return { cfg: {}, tenantId: undefined as string | undefined };

  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

  let from_address: string | undefined,
    brand_company: string | undefined,
    brand_address: string | undefined,
    brand_support: string | undefined;

  const byUser = await sb
    .from("email_settings")
    .select("from_address,brand_company,brand_address,brand_support")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUser.data) {
    ({ from_address, brand_company, brand_address, brand_support } =
      byUser.data as any);
  } else if (tenantId) {
    const byTenant = await sb
      .from("email_settings")
      .select("from_address,brand_company,brand_address,brand_support")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (byTenant.data) {
      ({ from_address, brand_company, brand_address, brand_support } =
        byTenant.data as any);
    }
  }

  const cfg = {
    fromOverride: from_address || undefined,
    brandCompany: brand_company || undefined,
    brandAddress: brand_address || undefined,
    brandSupport: brand_support || undefined,
  };
  return { cfg, tenantId };
}

type Body = {
  recipientIds?: string[]; // 省略時はテナント全員
  dryRun?: boolean;
};

/** CORS/プリフライト（405対策） */
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

function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await safeJson<Body>(req)) as Body;

    // 送信元/ブランド設定
    const { cfg, tenantId } = await loadSenderConfigForCurrentUser();
    if (!tenantId) {
      return NextResponse.json({ error: "tenant not found" }, { status: 400 });
    }

    // キャンペーン本文
    const { data: campaign, error: campErr } = await sb
      .from("campaigns")
      .select("id, tenant_id, subject, html, text, unsubscribe_token")
      .eq("id", id)
      .maybeSingle();

    if (campErr || !campaign) {
      return NextResponse.json(
        { error: campErr?.message || "campaign not found" },
        { status: 404 }
      );
    }
    if ((campaign as any).tenant_id !== tenantId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 対象受信者
    let recipientIds: string[] | null = null;

    if (Array.isArray(body.recipientIds) && body.recipientIds.length > 0) {
      recipientIds = body.recipientIds;
    } else {
      const { data: recs, error: rErr } = await sb
        .from("recipients")
        .select("id, email, unsubscribed_at") // ← disabled 等は未使用
        .eq("tenant_id", tenantId);
      if (rErr) {
        return NextResponse.json({ error: rErr.message }, { status: 400 });
      }
      const active = (recs ?? []).filter((r: any) => {
        if (!r?.id) return false;
        if (r?.unsubscribed_at) return false;
        return true;
      });
      recipientIds = active.map((r: any) => r.id as string);
    }

    if (!recipientIds || recipientIds.length === 0) {
      return NextResponse.json({ ok: true, enqueued: 0 });
    }

    if (body?.dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldEnqueue: recipientIds.length,
      });
    }

    // deliveries upsert
    const nowIso = new Date().toISOString();
    const rows = recipientIds.map((rid) => ({
      tenant_id: tenantId,
      campaign_id: id,
      recipient_id: rid,
      status: "queued" as const,
      queued_at: nowIso,
    }));
    for (const part of chunk(rows, 500)) {
      await sb.from("deliveries").upsert(part, {
        onConflict: "campaign_id,recipient_id",
      });
    }

    // Job投入（name=jobId 互換）
    const basePayload = {
      kind: "direct_email" as const,
      subject: (campaign as any).subject as string,
      html: (campaign as any).html as string,
      text: ((campaign as any).text as string | null) ?? undefined,
      unsubscribeToken:
        ((campaign as any).unsubscribe_token as string | null) ?? undefined,
      tenantId,
      ...cfg,
    };

    const { data: recEmails } = await sb
      .from("recipients")
      .select("id, email")
      .in("id", recipientIds);

    const emailById = new Map<string, string>();
    (recEmails ?? []).forEach((r: any) => {
      if (r?.id && r?.email) emailById.set(String(r.id), String(r.email));
    });

    let enqueued = 0;
    for (const rid of recipientIds) {
      const to = emailById.get(rid);
      if (!to) continue;

      await emailQueue.add(
        `camp:${id}:rcpt:${rid}:${Date.now()}`,
        { ...basePayload, to },
        { removeOnComplete: 1000, removeOnFail: 1000 }
      );
      enqueued++;
    }

    await sb.from("campaigns").update({ status: "queued" }).eq("id", id);

    return NextResponse.json({
      ok: true,
      enqueued,
      campaignId: id,
      tenantId,
      fromOverride: (basePayload as { fromOverride?: string }).fromOverride,
    });
  } catch (e: any) {
    console.error("POST /api/campaigns/[id]/send error:", e);
    return NextResponse.json(
      { error: e?.message || "internal error" },
      { status: 500 }
    );
  }
}
