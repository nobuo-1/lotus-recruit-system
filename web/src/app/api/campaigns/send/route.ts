export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

type Payload = {
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null; // 未来=予約 / 未指定=即時
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Payload>;
    const campaignId = (body.campaignId ?? "").trim();
    const recipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds.filter(Boolean)
      : [];
    const scheduleAtISO = body.scheduleAt ?? null;

    if (!campaignId || recipientIds.length === 0) {
      return NextResponse.json(
        { error: "campaignId と recipientIds は必須です" },
        { status: 400 }
      );
    }

    const supabase = await supabaseServer();

    // 認証→tenant
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof, error: pe } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (pe) return NextResponse.json({ error: pe.message }, { status: 400 });

    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // キャンペーン本体
    const { data: camp, error: ce } = await supabase
      .from("campaigns")
      .select("id, tenant_id, subject, body_html, from_email, status")
      .eq("id", campaignId)
      .maybeSingle();
    if (ce || !camp || camp.tenant_id !== tenantId)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    // テナントのブランド設定（フッター/差出人上書きに使用）
    const { data: brand } = await supabase
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();

    // 受信者
    const { data: recs, error: re } = await supabase
      .from("recipients")
      .select("id, email, unsubscribe_token, is_active, consent")
      .eq("tenant_id", tenantId)
      .in("id", recipientIds);
    if (re) return NextResponse.json({ error: re.message }, { status: 400 });

    const recipients = (recs ?? []).filter(
      (r: any) => r?.email && (r.is_active ?? true) && r.consent !== "opt_out"
    );
    if (recipients.length === 0)
      return NextResponse.json({ error: "no recipients" }, { status: 400 });

    // 二重配信防止（予約/キュー/送信済）
    const { data: already } = await supabase
      .from("deliveries")
      .select("recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in("status", ["scheduled", "queued", "sent"]);
    const exclude = new Set((already ?? []).map((r: any) => r.recipient_id));
    const targets = recipients.filter((r) => !exclude.has(r.id));
    if (targets.length === 0)
      return NextResponse.json({ ok: true, queued: 0, scheduled: null });

    // 予約 or 即時
    const nowMs = Date.now();
    let delay = 0;
    let scheduleAt: string | null = null;
    if (scheduleAtISO) {
      const ts = Date.parse(scheduleAtISO);
      if (Number.isNaN(ts))
        return NextResponse.json(
          { error: "scheduleAt が不正です" },
          { status: 400 }
        );
      delay = Math.max(0, ts - nowMs);
      scheduleAt = new Date(ts).toISOString();
    }

    // ===== DB を先に反映（UI 即時反映用） =====
    if (scheduleAt) {
      // deliveries を scheduled に
      const { error: dErr } = await supabase.from("deliveries").upsert(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "scheduled",
          scheduled_at: scheduleAt,
        })),
        { onConflict: "campaign_id,recipient_id" }
      );
      if (dErr) console.error("[deliveries.upsert scheduled] ", dErr);

      // email_schedules を scheduled に（一覧用）
      const { error: sErr } = await supabase.from("email_schedules").upsert(
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
      if (sErr) console.error("[email_schedules.upsert] ", sErr);

      // 見かけのキャンペーン状態
      await supabase
        .from("campaigns")
        .update({ status: "scheduled" })
        .eq("id", campaignId);
    } else {
      // 即時: deliveries を queued
      const { error: dErr } = await supabase.from("deliveries").upsert(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "queued",
          scheduled_at: null,
        })),
        { onConflict: "campaign_id,recipient_id" }
      );
      if (dErr) console.error("[deliveries.upsert queued] ", dErr);

      await supabase
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", campaignId);
    }

    // ===== メールジョブ投入 =====
    const fromOverride = brand?.from_email ?? camp.from_email ?? undefined;
    const brandCompany = brand?.company_name ?? undefined;
    const brandAddress = brand?.company_address ?? undefined;
    const brandSupport = brand?.support_email ?? undefined;

    let queued = 0;
    for (const r of targets) {
      const job: DirectEmailJob = {
        kind: "direct_email",
        to: r.email as string,
        subject: (camp.subject ?? "") as string,
        html: (camp.body_html ?? "") as string,
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
        delay, // 予約は遅延
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      queued++;
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
