// web/src/app/api/campaigns/[id]/enqueue/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue, type DirectEmailJob } from "@/server/queue";

type EnqueueBody = {
  recipientIds?: string[];
};

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
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

    const tenantId = prof?.tenant_id as string | undefined;
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
      body = await req.json();
    } catch {
      body = null;
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

    const candidates = (recs ?? []).filter(
      (r: any) => r?.email && (r.is_active ?? true)
    );
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
      (deliveredRows ?? []).map((d: any) => d.recipient_id)
    );
    const targets = candidates.filter((r: any) => !sentSet.has(r.id));
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: candidates.length,
      });
    }

    // 8) キュー投入 + deliveries へ queued で記録
    const fromOverride = brand?.from_email ?? camp.from_email ?? undefined;
    const brandCompany = brand?.company_name ?? undefined;
    const brandAddress = brand?.company_address ?? undefined;
    const brandSupport = brand?.support_email ?? undefined;

    let queued = 0;

    for (const r of targets) {
      // deliveries へ queued で先に記録（重複は一意制約で自然に弾く前提）
      await supabase.from("deliveries").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        recipient_id: r.id,
        status: "queued",
        scheduled_at: null,
        sent_at: null,
      });

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: r.email as string,
        subject: (camp.subject ?? "") as string,
        html: (camp.body_html ?? "") as string,
        text: undefined,
        tenantId,
        unsubscribeToken: (r as any).unsubscribe_token ?? undefined,
        fromOverride,
        brandCompany,
        brandAddress,
        brandSupport,
      };

      // campaignId は型に無いので data に含めない。
      // 代わりに jobId へ埋め込み、トレースできるようにする。
      await emailQueue.add("direct_email", job, {
        jobId: `camp:${campaignId}:rcpt:${r.id}:${Date.now()}`,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });

      queued++;
    }

    // 9) ステータス更新（未送信→キュー済み）
    if (queued > 0 && camp.status !== "queued") {
      await supabase
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", campaignId);
    }

    return NextResponse.json({
      ok: true,
      queued,
      skipped: candidates.length - queued,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "internal error" },
      { status: 500 }
    );
  }
}
