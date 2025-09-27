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

const appUrl = process.env.APP_URL || "http://localhost:3000";

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

    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // キャンペーン取得（差出人/本文）
    const { data: camp, error: ce } = await supabase
      .from("campaigns")
      .select("id, tenant_id, name, subject, body_html, from_email, status")
      .eq("id", campaignId)
      .maybeSingle();
    if (ce || !camp || camp.tenant_id !== tenantId)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    // テナント設定（フッター上書き等）
    const { data: brand } = await supabase
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();

    // 受信者取得（同一テナント & アクティブ & opt-out 以外）
    const { data: recs } = await supabase
      .from("recipients")
      .select("id, email, unsubscribe_token, is_active, consent")
      .eq("tenant_id", tenantId)
      .in("id", recipientIds);

    const recipients = (recs ?? []).filter(
      (r) => r?.email && (r.is_active ?? true) && r.consent !== "opt_out"
    );
    if (recipients.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    // 同キャンペーンで既に予約/送信済みのIDは除外（二重配信防止）
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

    // --- deliveries を upsert（予約は scheduled、即時は queued） ---
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

      // キャンペーン見かけの状態
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

    // ★ ピクセル埋め込み用に delivery_id を取得（recipient_id → id の対応）
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
      idMap.set(d.recipient_id as string, d.id as string)
    );

    // キュー投入（jobId に campaignId/recipientId を埋め込み）
    const fromOverride = brand?.from_email ?? camp.from_email ?? undefined;
    const brandCompany = brand?.company_name ?? undefined;
    const brandAddress = brand?.company_address ?? undefined;
    const brandSupport = brand?.support_email ?? undefined;

    let queued = 0;
    for (const r of targets) {
      const deliveryId = idMap.get(r.id);
      // 個別ピクセルURLを本文へ埋め込み
      const htmlWithPixel =
        deliveryId && !scheduleAt // 予約でも本文は同じ。送信時点で画像が読まれるだけ
          ? injectOpenPixel(
              camp.body_html ?? "",
              `${appUrl}/api/email/open?id=${encodeURIComponent(deliveryId)}`
            )
          : injectOpenPixel(
              camp.body_html ?? "",
              `${appUrl}/api/email/open?id=${encodeURIComponent(
                deliveryId ?? ""
              )}`
            );

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: r.email as string,
        subject: (camp.subject ?? "") as string,
        html: htmlWithPixel,
        text: undefined,
        tenantId,
        unsubscribeToken: r.unsubscribe_token ?? undefined,
        fromOverride,
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
    });
  } catch (e: any) {
    console.error("POST /api/campaigns/send error", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
