// web/src/app/api/campaigns/[id]/send/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";

/** /email/settings から送信元/ブランド設定を取得（user優先→tenant→tenantsフォールバック） */
async function loadSenderConfigForCurrentUser() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user) return { cfg: {}, tenantId: undefined as string | undefined };

  // tenant_id
  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

  let from_address: string | undefined;
  let brand_company: string | undefined;
  let brand_address: string | undefined;
  let brand_support: string | undefined;

  // user 設定
  const byUser = await sb
    .from("email_settings")
    .select("from_address,brand_company,brand_address,brand_support")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUser.data) {
    ({ from_address, brand_company, brand_address, brand_support } =
      byUser.data as any);
  }

  // tenant 設定
  if ((!from_address || !brand_company) && tenantId) {
    const byTenant = await sb
      .from("email_settings")
      .select("from_address,brand_company,brand_address,brand_support")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (byTenant.data) {
      from_address = from_address || (byTenant.data as any).from_address;
      brand_company = brand_company || (byTenant.data as any).brand_company;
      brand_address = brand_address || (byTenant.data as any).brand_address;
      brand_support = brand_support || (byTenant.data as any).brand_support;
    }

    // tenants テーブル フォールバック
    const { data: tenantRow } = await sb
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRow) {
      from_address = from_address || (tenantRow as any).from_email || undefined;
      brand_company =
        brand_company || (tenantRow as any).company_name || undefined;
      brand_address =
        brand_address || (tenantRow as any).company_address || undefined;
      brand_support =
        brand_support || (tenantRow as any).support_email || undefined;
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

/** 配列を n 件ずつに分割 */
function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
}

type Body = {
  recipientIds?: string[]; // 渡されなければテナント全受信者
  dryRun?: boolean;
};

/** 空ボディでも落ちない JSON パーサ */
async function safeJson<T = any>(req: Request): Promise<T | {}> {
  try {
    if (!req.headers.get("content-length")) return {};
    return (await req.json()) as T;
  } catch {
    return {};
  }
}

/** CORS / プリフライト */
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

    // キャンペーン取得
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
    if (campaign.tenant_id !== tenantId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 対象受信者
    let recipientIds: string[] | null = null;

    if (Array.isArray(body.recipientIds) && body.recipientIds.length > 0) {
      recipientIds = body.recipientIds;
    } else {
      // 最小カラムのみ選択（列がない環境でも安全）
      const { data: recs, error: rErr } = await sb
        .from("recipients")
        .select("id, email, unsubscribe_token, unsubscribed_at")
        .eq("tenant_id", tenantId);

      if (rErr) {
        return NextResponse.json({ error: rErr.message }, { status: 400 });
      }

      const active = (recs ?? []).filter((r: any) => {
        if (!r?.id || !r?.email) return false;
        // 任意列が存在すれば尊重（存在チェックしてから）
        if ("disabled" in r && r?.disabled === true) return false;
        if ("is_active" in r && r?.is_active === false) return false;
        if ("consent" in r && r?.consent === "opt_out") return false;
        if (r?.unsubscribed_at) return false;
        return true;
      });

      recipientIds = active.map((r: any) => String(r.id));
    }

    if (!recipientIds || recipientIds.length === 0) {
      return NextResponse.json({ ok: true, enqueued: 0 });
    }

    // dry-run
    if (body?.dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldEnqueue: recipientIds.length,
      });
    }

    // deliveries upsert（queued）
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

    // 受信者メールを一括取得
    const { data: recEmails } = await sb
      .from("recipients")
      .select("id, email, unsubscribe_token")
      .in("id", recipientIds);

    const emailById = new Map<string, { email: string; token?: string }>();
    (recEmails ?? []).forEach((r: any) => {
      if (r?.id && r?.email) {
        emailById.set(String(r.id), {
          email: String(r.email),
          token: r.unsubscribe_token ?? undefined,
        });
      }
    });

    // キュー投入（jobId をパターンに）
    let enqueued = 0;
    for (const rid of recipientIds) {
      const rec = emailById.get(rid);
      if (!rec) continue;

      await emailQueue.add(
        "direct_email",
        {
          kind: "direct_email",
          to: rec.email,
          subject: String(campaign.subject ?? ""),
          html: String(campaign.html ?? ""),
          text: (campaign.text as string | null) ?? undefined,
          unsubscribeToken: rec.token,
          tenantId,
          ...cfg, // fromOverride / brand*
        },
        {
          jobId: `camp:${id}:rcpt:${rid}:${Date.now()}`,
          removeOnComplete: 1000,
          removeOnFail: 1000,
        }
      );
      enqueued++;
    }

    // 見た目状態
    await sb.from("campaigns").update({ status: "queued" }).eq("id", id);

    return NextResponse.json({
      ok: true,
      enqueued,
      campaignId: id,
      tenantId,
      fromOverride: (cfg as { fromOverride?: string }).fromOverride ?? null,
    });
  } catch (e: any) {
    console.error("POST /api/campaigns/[id]/send error:", e);
    return NextResponse.json(
      { error: e?.message || "internal error" },
      { status: 500 }
    );
  }
}
