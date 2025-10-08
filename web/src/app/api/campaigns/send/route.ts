// web/src/app/api/campaigns/send/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

type Payload = {
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null; // ISO 将来日時で予約
};

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

/** /email/settings（user→tenant→tenants） */
async function loadSenderConfigForCurrentUser() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user)
    return {
      tenantId: undefined as string | undefined,
      cfg: {} as {
        fromOverride?: string;
        brandCompany?: string;
        brandAddress?: string;
        brandSupport?: string;
      },
    };

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

  // user
  const byUser = await sb
    .from("email_settings")
    .select("from_address,brand_company,brand_address,brand_support")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUser.data) {
    ({ from_address, brand_company, brand_address, brand_support } =
      byUser.data as any);
  }

  // tenant
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

  return {
    tenantId,
    cfg: {
      fromOverride: from_address || undefined,
      brandCompany: brand_company || undefined,
      brandAddress: brand_address || undefined,
      brandSupport: brand_support || undefined,
    },
  };
}

/** ピクセル挿入（</body> の直前。無ければ末尾） */
function injectOpenPixel(html: string, url: string) {
  const pixel = `<img src="${url}" alt="" width="1" height="1" style="display:none;max-width:1px;max-height:1px;" />`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${pixel}\n</body>`)
    : `${html}\n${pixel}`;
}

/** 配列を n 件ずつに分割 */
function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;
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

    const supabase = await supabaseServer();

    // 認証
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 送信元/ブランド
    const { tenantId, cfg } = await loadSenderConfigForCurrentUser();
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // キャンペーン（html or body_html を採用）
    const { data: camp, error: ce } = await supabase
      .from("campaigns")
      .select(
        "id, tenant_id, name, subject, body_html, html, text, from_email, status"
      )
      .eq("id", campaignId)
      .maybeSingle();
    if (ce || !camp || camp.tenant_id !== tenantId)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    const htmlBody = (camp as any).html ?? (camp as any).body_html ?? "";

    // 受信者（最小カラム取得＋任意列は存在する時のみ評価）
    const { data: recs } = await supabase
      .from("recipients")
      .select("id, email, unsubscribe_token, unsubscribed_at")
      .eq("tenant_id", tenantId)
      .in("id", recipientIds);

    const recipients = (recs ?? []).filter((r: any) => {
      if (!r?.email) return false;
      if ("disabled" in r && r?.disabled === true) return false;
      if ("is_active" in r && r?.is_active === false) return false;
      if ("consent" in r && r?.consent === "opt_out") return false;
      if (r?.unsubscribed_at) return false;
      return true;
    });
    if (recipients.length === 0)
      return NextResponse.json({ error: "no recipients" }, { status: 400 });

    // 既送/予約済み除外
    const { data: already } = await supabase
      .from("deliveries")
      .select("recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in("status", ["scheduled", "queued", "sent"]);
    const exclude = new Set(
      (already ?? []).map((r: any) => String(r.recipient_id))
    );
    const targets = recipients.filter((r) => !exclude.has(String(r.id)));
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: recipientIds.length,
      });
    }

    // 予約 or 即時
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

    // deliveries upsert
    if (scheduleAt) {
      await supabase.from("deliveries").upsert(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "scheduled",
          scheduled_at: scheduleAt,
        })),
        { onConflict: "campaign_id,recipient_id" }
      );
      await supabase
        .from("campaigns")
        .update({ status: "scheduled" })
        .eq("id", campaignId);
    } else {
      await supabase.from("deliveries").upsert(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "queued",
          scheduled_at: null,
        })),
        { onConflict: "campaign_id,recipient_id" }
      );
      await supabase
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", campaignId);
    }

    // delivery_id map（ピクセル用）
    const { data: dels } = await supabase
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
      idMap.set(String(d.recipient_id), String(d.id))
    );

    // 差出人（設定→キャンペーン from_email → mailer デフォルト）
    const fromOverride =
      (cfg.fromOverride as string | undefined) ||
      ((camp as any).from_email as string | undefined) ||
      undefined;

    // キュー投入
    let queued = 0;
    for (const r of targets) {
      const deliveryId = idMap.get(String(r.id));
      const pixelUrl = `${appUrl}/api/email/open?id=${encodeURIComponent(
        deliveryId ?? ""
      )}`;
      const htmlWithPixel = injectOpenPixel(htmlBody ?? "", pixelUrl);

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: String(r.email),
        subject: String(camp.subject ?? ""),
        html: htmlWithPixel,
        text: (camp.text as string | null) ?? undefined,
        tenantId,
        unsubscribeToken: (r as any).unsubscribe_token ?? undefined,
        fromOverride,
        brandCompany: cfg.brandCompany,
        brandAddress: cfg.brandAddress,
        brandSupport: cfg.brandSupport,
      };

      await emailQueue.add("direct_email", job, {
        jobId: `camp:${campaignId}:rcpt:${r.id}:${Date.now()}`,
        delay,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      queued++;
    }

    // 予約リスト集約
    if (scheduleAt) {
      await supabase.from("email_schedules").upsert(
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
    console.error("POST /api/campaigns/send error", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
