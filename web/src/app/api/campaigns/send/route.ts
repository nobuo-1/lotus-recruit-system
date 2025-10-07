// web/src/app/api/campaigns/send/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

type Payload = {
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null; // ISO。省略→即時
};

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

/** 個別オープンピクセルを本文に挿入 */
function injectOpenPixel(html: string, url: string) {
  const pixel =
    `<img src="${url}" alt="" width="1" height="1" ` +
    `style="display:none;max-width:1px;max-height:1px;" />`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${pixel}\n</body>`)
    : `${html}\n${pixel}`;
}

/** /email/settings の「ユーザー優先→テナント」設定を読む */
async function loadSenderConfigForCurrentUser() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user)
    return { tenantId: undefined as string | undefined, cfg: {} as any };

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

  return {
    tenantId,
    cfg: {
      fromOverride: from_address || undefined, // ← 指定があればこちらを優先
      brandCompany: brand_company || undefined,
      brandAddress: brand_address || undefined,
      brandSupport: brand_support || undefined,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Payload>;
    const campaignId = body.campaignId ?? "";
    const recipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds
      : [];
    const scheduleAtISO = body.scheduleAt ?? null;

    if (!campaignId || recipientIds.length === 0) {
      return NextResponse.json(
        { error: "campaignId と recipientIds は必須です" },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();

    // 認証→tenant
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // 送信元/ブランド（ユーザー優先→テナント）
    const { cfg } = await loadSenderConfigForCurrentUser();

    // キャンペーン本文（このプロジェクトのスキーマに合わせて取得）
    const { data: camp, error: ce } = await sb
      .from("campaigns")
      .select("id, tenant_id, subject, body_html, from_email, status")
      .eq("id", campaignId)
      .maybeSingle();

    if (ce || !camp || camp.tenant_id !== tenantId) {
      return NextResponse.json(
        { error: "campaign not found" },
        { status: 404 }
      );
    }

    // テナントのブランド情報（存在すれば利用）
    const { data: brand } = await sb
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();

    // 受信者の取得（ is_active / opt-out 除外 ）
    const { data: recs, error: re } = await sb
      .from("recipients")
      .select(
        "id, email, unsubscribe_token, is_active, consent, disabled, unsubscribed_at"
      )
      .eq("tenant_id", tenantId)
      .in("id", recipientIds);

    if (re) return NextResponse.json({ error: re.message }, { status: 400 });

    const recipients = (recs ?? []).filter((r: any) => {
      if (!r?.email) return false;
      if (r?.disabled === true) return false;
      if (r?.unsubscribed_at) return false;
      if (r?.is_active === false) return false;
      if (r?.consent === "opt_out") return false;
      return true;
    });
    if (recipients.length === 0)
      return NextResponse.json({ error: "no recipients" }, { status: 400 });

    // すでに scheduled/queued/sent 済みは除外
    const { data: already } = await sb
      .from("deliveries")
      .select("recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in("status", ["scheduled", "queued", "sent"]);

    const exclude = new Set((already ?? []).map((r: any) => r.recipient_id));
    const targets = recipients.filter((r) => !exclude.has(r.id));
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: recipientIds.length,
      });
    }

    // 予約か即時か
    const now = Date.now();
    let delay = 0;
    let scheduleAt: string | null = null;
    if (scheduleAtISO) {
      const ts = Date.parse(scheduleAtISO);
      if (Number.isNaN(ts))
        return NextResponse.json(
          { error: "scheduleAt が不正です" },
          { status: 400 }
        );
      delay = Math.max(0, ts - now);
      scheduleAt = new Date(ts).toISOString();
    }

    // deliveries を upsert
    if (scheduleAt) {
      await sb.from("deliveries").upsert(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "scheduled",
          scheduled_at: scheduleAt,
        })),
        { onConflict: "campaign_id,recipient_id" }
      );
      await sb
        .from("campaigns")
        .update({ status: "scheduled" })
        .eq("id", campaignId);
    } else {
      await sb.from("deliveries").upsert(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "queued",
          scheduled_at: null,
        })),
        { onConflict: "campaign_id,recipient_id" }
      );
      await sb
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", campaignId);
    }

    // delivery_id を取得（ピクセル埋め込み用）
    const { data: dels } = await sb
      .from("deliveries")
      .select("id, recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in(
        "recipient_id",
        targets.map((t) => t.id)
      );

    const idMap = new Map<string, string>();
    (dels ?? []).forEach((d) =>
      idMap.set(d.recipient_id as string, d.id as string)
    );

    // 送信元判定：/email/settings > tenants.from_email > campaigns.from_email > 環境変数(FROM_EMAIL)
    const fromOverride =
      (cfg as any)?.fromOverride ||
      (brand?.from_email as string | undefined) ||
      (camp.from_email as string | undefined) ||
      undefined;

    const brandCompany =
      (cfg as any)?.brandCompany ?? brand?.company_name ?? undefined;
    const brandAddress =
      (cfg as any)?.brandAddress ?? brand?.company_address ?? undefined;
    const brandSupport =
      (cfg as any)?.brandSupport ?? brand?.support_email ?? undefined;

    // キュー投入
    let queued = 0;
    for (const r of targets) {
      const deliveryId = idMap.get(r.id);
      const htmlWithPixel = injectOpenPixel(
        (camp.body_html ?? "") as string,
        `${appUrl}/api/email/open?id=${encodeURIComponent(deliveryId ?? "")}`
      );

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: r.email as string,
        subject: (camp.subject ?? "") as string,
        html: htmlWithPixel,
        text: undefined,
        tenantId,
        unsubscribeToken: r.unsubscribe_token ?? undefined,
        fromOverride, // ← 指定時はここが From になる / 未指定なら defaultFrom
        brandCompany,
        brandAddress,
        brandSupport,
      };

      const jobId = `camp:${campaignId}:rcpt:${r.id}:${Date.now()}`;
      await emailQueue.add("direct_email", job, {
        jobId,
        delay,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      queued++;
    }

    // 予約の集約表示用
    if (scheduleAt) {
      await sb.from("email_schedules").upsert(
        [
          {
            tenant_id: tenantId,
            campaign_id: campaignId,
            scheduled_at: scheduleAt,
            status: "scheduled",
          },
        ],
        { onConflict: "tenant_id,campaign_id,scheduled_at" }
      );
    }

    return NextResponse.json({
      ok: true,
      queued,
      scheduled: scheduleAt ?? null,
      fromOverride: fromOverride ?? null,
    });
  } catch (e: any) {
    console.error("POST /api/campaigns/send error:", e);
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}
