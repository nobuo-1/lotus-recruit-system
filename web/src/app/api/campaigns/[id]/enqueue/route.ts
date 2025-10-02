// web/src/app/api/campaigns/[id]/enqueue/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue, type DirectEmailJob } from "@/server/queue";

type EnqueueBody = {
  recipientIds?: string[];
};
type RecipientRow = {
  id: string;
  email: string | null;
  unsubscribe_token: string | null;
  consent: string | null;
  is_active: boolean | null;
};
type DeliveredRow = { recipient_id: string };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await ctx.params;
    const supabase = await supabaseServer();

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: prof, error: pe } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (pe) return NextResponse.json({ error: pe.message }, { status: 400 });

    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    const { data: camp, error: ce } = await supabase
      .from("campaigns")
      .select("id, tenant_id, name, subject, body_html, from_email, status")
      .eq("id", campaignId)
      .single();
    if (ce) return NextResponse.json({ error: ce.message }, { status: 404 });
    if (!camp || camp.tenant_id !== tenantId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const { data: brand, error: be } = await supabase
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (be) return NextResponse.json({ error: be.message }, { status: 400 });

    let body: EnqueueBody | null = null;
    try {
      body = (await req.json()) as EnqueueBody;
    } catch {
      body = null;
    }

    let q = supabase
      .from("recipients")
      .select("id, email, unsubscribe_token, consent, is_active")
      .eq("tenant_id", tenantId)
      .neq("consent", "opt_out");

    if (body?.recipientIds?.length) q = q.in("id", body.recipientIds);

    const { data: recs, error: re } = await q;
    if (re) return NextResponse.json({ error: re.message }, { status: 400 });

    const recsData = (recs ?? []) as RecipientRow[];
    const candidates = recsData.filter(
      (r) => !!r.email && (r.is_active ?? true)
    );
    if (candidates.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    const { data: deliveredRows, error: de } = await supabase
      .from("deliveries")
      .select("recipient_id")
      .eq("campaign_id", campaignId);
    if (de) return NextResponse.json({ error: de.message }, { status: 400 });

    const delivered = (deliveredRows ?? []) as DeliveredRow[];
    const sentSet = new Set<string>(delivered.map((d) => d.recipient_id));

    const targets = candidates.filter((r) => !sentSet.has(r.id));
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: candidates.length,
      });
    }

    const fromOverride = brand?.from_email ?? camp.from_email ?? undefined;
    const brandCompany = brand?.company_name ?? undefined;
    const brandAddress = brand?.company_address ?? undefined;
    const brandSupport = brand?.support_email ?? undefined;

    let queued = 0;

    for (const r of targets) {
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
        unsubscribeToken: r.unsubscribe_token ?? undefined,
        fromOverride,
        brandCompany,
        brandAddress,
        brandSupport,
      };

      await emailQueue.add("direct_email", job, {
        jobId: `camp:${campaignId}:rcpt:${r.id}:${Date.now()}`,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });

      queued++;
    }

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg ?? "internal error" },
      { status: 500 }
    );
  }
}
