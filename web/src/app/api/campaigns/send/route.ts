// web/src/app/api/campaigns/send/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

type Payload = {
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null; // 未来→予約 / 省略→即時
};

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

/** /email/settings（user優先→tenant）から送信元/ブランド設定をロード */
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

  // 1) user 設定
  const byUser = await sb
    .from("email_settings")
    .select("from_address,brand_company,brand_address,brand_support")
    .eq("user_id", user.id)
    .maybeSingle();

  if (byUser.data) {
    ({ from_address, brand_company, brand_address, brand_support } =
      byUser.data as any);
  }

  // 2) user 設定が無ければ tenant 設定
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
  }

  // 3) さらに足りなければ tenants テーブルをフォールバック
  if (tenantId) {
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

/** </body> 直前に 1px ピクセルを差し込む（無ければ末尾に付与） */
function injectOpenPixel(html: string, url: string) {
  const pixel =
    `<img src="${url}" alt="" width="1" height="1" ` +
    `style="display:none;max-width:1px;max-height:1px;" />`;
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${pixel}\n</body>`);
  }
  return `${html}\n${pixel}`;
}

/** 配列を n 件ずつに分割 */
function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
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

    const supabase = await supabaseServer();

    // 認証 → tenant
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 送信元/ブランド設定
    const { tenantId, cfg } = await loadSenderConfigForCurrentUser();
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // キャンペーン取得（本文は body_html / html どちらでも拾う）
    const { data: camp, error: ce } = await supabase
      .from("campaigns")
      .select(
        "id, tenant_id, name, subject, body_html, html, text, from_email, status"
      )
      .eq("id", campaignId)
      .maybeSingle();

    if (ce || !camp || camp.tenant_id !== tenantId)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    const htmlBody =
      (camp as any).html ??
      (camp as any).body_html ??
      ""; /* どちらか存在する方を使用 */

    // 対象受信者（テナント一致＆アクティブ＆未オプトアウト／未購読解除）
    const { data: recs } = await supabase
      .from("recipients")
      .select(
        "id, email, unsubscribe_token, is_active, consent, unsubscribed_at, disabled"
      )
      .eq("tenant_id", tenantId)
      .in("id", recipientIds);

    const recipients = (recs ?? []).filter((r: any) => {
      if (!r?.email) return false;
      if (r.disabled === true) return false;
      if (r.unsubscribed_at) return false;
      if (r.is_active === false) return false;
      if (r.consent === "opt_out") return false;
      return true;
    });
    if (recipients.length === 0)
      return NextResponse.json({ error: "no recipients" }, { status: 400 });

    // 重複配信防止（既に予約/送信済みは除外）
    const { data: already } = await supabase
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

    // deliveries を upsert
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

    // delivery_id ←→ recipient_id map（開封ピクセル埋め込み用）
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

    // fromOverride: user/tenant の設定 → 無ければキャンペーンの from_email
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
        // ここが「指定メールアドレス」— mailer 側で Sender を no-reply にし、Reply-To にも反映
        fromOverride,
        brandCompany: cfg.brandCompany,
        brandAddress: cfg.brandAddress,
        brandSupport: cfg.brandSupport,
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

    // 予約の集約表示（メール予約リスト用）
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
