// src/app/api/campaigns/[id]/enqueue/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue, type DirectEmailJob } from "@/server/queue";

type EnqueueBody = {
  recipientIds?: string[];
  when?: string; // ← 予約時刻(ISO)。指定なしなら即時
};

type RecipientRow = {
  id: string;
  email: string | null;
  unsubscribe_token: string | null;
  consent: string | null; // "opt_out" など
  is_active: boolean | null;
};

type DeliveredRow = { recipient_id: string };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> } // Next.js 15: params は Promise
) {
  try {
    const { id: campaignId } = await ctx.params;
    const supabase = await supabaseServer();

    // 1) 認証
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 2) テナント取得
    const { data: prof, error: pe } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (pe) return NextResponse.json({ error: pe.message }, { status: 400 });
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    // 3) キャンペーン取得
    const { data: camp, error: ce } = await supabase
      .from("campaigns")
      .select("id, tenant_id, name, subject, body_html, from_email, status")
      .eq("id", campaignId)
      .single();
    if (ce) return NextResponse.json({ error: ce.message }, { status: 404 });
    if (!camp || camp.tenant_id !== tenantId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // 4) ブランド / 差出人設定
    const { data: brand, error: be } = await supabase
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (be) return NextResponse.json({ error: be.message }, { status: 400 });

    // 5) body(任意)
    let body: EnqueueBody | null = null;
    try {
      body = (await req.json()) as EnqueueBody;
    } catch {
      body = null;
    }

    // when（予約時刻）が正しいか判定
    let delayMs = 0;
    let scheduledISO: string | null = null;
    if (body?.when) {
      const dt = new Date(body.when);
      if (Number.isNaN(dt.getTime())) {
        return NextResponse.json(
          { error: "invalid datetime" },
          { status: 400 }
        );
      }
      delayMs = Math.max(0, dt.getTime() - Date.now());
      scheduledISO = dt.toISOString();
    }

    // 6) 宛先取得（opt-out / 非アクティブ除外）
    let q = supabase
      .from("recipients")
      .select("id, email, unsubscribe_token, consent, is_active")
      .eq("tenant_id", tenantId)
      .neq("consent", "opt_out");

    if (body?.recipientIds?.length) {
      q = q.in("id", body.recipientIds);
    }

    const { data: recs, error: re } = await q;
    if (re) return NextResponse.json({ error: re.message }, { status: 400 });

    const candidates = (recs ?? [])
      .map((r) => r as RecipientRow)
      .filter((r) => !!r.email && (r.is_active ?? true));
    if (candidates.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    // 7) 既送信(同キャンペーン)を deliveries から除外
    const { data: deliveredRows, error: de } = await supabase
      .from("deliveries")
      .select("recipient_id")
      .eq("campaign_id", campaignId);
    if (de) return NextResponse.json({ error: de.message }, { status: 400 });

    const sentSet = new Set<string>(
      (deliveredRows ?? []).map((d) => (d as DeliveredRow).recipient_id)
    );
    const targets = candidates.filter((r) => !sentSet.has(r.id));
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: candidates.length,
      });
    }

    // 8) （予約のときだけ）email_schedules に 1 行追加しておく→一覧の「未来予約あり」表示に使う
    if (scheduledISO) {
      await supabase.from("email_schedules").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        scheduled_at: scheduledISO,
        status: "scheduled",
      });
    }

    // 9) キュー投入 + deliveries へ記録
    const fromOverride = brand?.from_email ?? camp.from_email ?? undefined;
    const brandCompany = brand?.company_name ?? undefined;
    const brandAddress = brand?.company_address ?? undefined;
    const brandSupport = brand?.support_email ?? undefined;

    let queued = 0;

    for (const r of targets) {
      // deliveries へ先に記録
      await supabase.from("deliveries").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        recipient_id: r.id,
        status: scheduledISO ? "scheduled" : "queued",
        scheduled_at: scheduledISO ?? null,
        sent_at: null,
      });

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: r.email as string,
        subject: String(camp.subject ?? ""),
        html: String(camp.body_html ?? ""),
        text: undefined,
        tenantId,
        unsubscribeToken: r.unsubscribe_token ?? undefined,
        fromOverride,
        brandCompany,
        brandAddress,
        brandSupport,
      };

      await emailQueue.add("direct_email", job, {
        jobId: `camp:${campaignId}:rcpt:${r.id}:${Date.now()}`,
        delay: delayMs, // ← ここが肝
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });

      queued++;
    }

    // 10) ステータス更新
    if (scheduledISO) {
      await supabase
        .from("campaigns")
        .update({ status: "scheduled", scheduled_at: scheduledISO })
        .eq("id", campaignId);
    } else if (queued > 0 && camp.status !== "queued") {
      await supabase
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", campaignId);
    }

    return NextResponse.json({
      ok: true,
      queued,
      skipped: candidates.length - queued,
      scheduled_at: scheduledISO ?? null,
      delay_ms: delayMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg ?? "internal error" },
      { status: 500 }
    );
  }
}
