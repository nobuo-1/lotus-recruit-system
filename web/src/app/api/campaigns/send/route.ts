// web/src/app/api/campaigns/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

type Payload = {
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null; // 未来ISO→予約 / 省略→即時
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

/** ルート生存確認用（関数に届いているかを判別するための保険） */
export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
export async function HEAD() {
  return new NextResponse(null, { status: 405 });
}

/** /email/settings を user→tenant→tenants の順でフェッチ */
async function loadSenderConfigForCurrentUser() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;

  if (!user) {
    return {
      tenantId: undefined as string | undefined,
      cfg: {} as {
        fromOverride?: string;
        brandCompany?: string;
        brandAddress?: string;
        brandSupport?: string;
      },
    };
  }

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

  const byUser = await sb
    .from("email_settings")
    .select("from_address,brand_company,brand_address,brand_support")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUser.data) {
    ({ from_address, brand_company, brand_address, brand_support } =
      byUser.data as any);
  }

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

  if (tenantId) {
    const { data: t } = await sb
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (t) {
      from_address = from_address || (t as any).from_email || undefined;
      brand_company = brand_company || (t as any).company_name || undefined;
      brand_address = brand_address || (t as any).company_address || undefined;
      brand_support = brand_support || (t as any).support_email || undefined;
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

/** HTML末尾に開封ピクセルを1回だけ注入 */
function injectOpenPixel(html: string, url: string) {
  const pixel = `<img src="${url}" alt="" width="1" height="1" style="display:none;max-width:1px;max-height:1px;" />`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${pixel}\n</body>`)
    : `${html}\n${pixel}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
}

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

export async function POST(req: Request) {
  try {
    // ① 入力
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;
    const campaignId = String(body.campaignId ?? "");
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

    // ② 認証・tenant
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { tenantId, cfg } = await loadSenderConfigForCurrentUser();
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // ③ キャンペーン本文（body_html / html どちらでも）
    const { data: camp } = await sb
      .from("campaigns")
      .select(
        "id, tenant_id, name, subject, body_html, html, text, from_email, status"
      )
      .eq("id", campaignId)
      .maybeSingle();
    if (!camp || (camp as any).tenant_id !== tenantId)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    const htmlBody =
      ((camp as any).html as string | null) ??
      ((camp as any).body_html as string | null) ??
      "";

    // ④ 受信者（**DB差異に強い最小カラム**）
    const { data: recs, error: rErr } = await sb
      .from("recipients")
      .select("id, email, unsubscribe_token, unsubscribed_at")
      .in("id", recipientIds)
      .eq("tenant_id", tenantId);

    if (rErr)
      return NextResponse.json({ error: rErr.message }, { status: 400 });

    // 余計なカラム（disabled, is_active, consent）が無い環境でも安全にフィルタ
    const recipients = (recs ?? []).filter((r: any) => {
      if (!r?.email) return false;
      if (r?.unsubscribed_at) return false;
      return true;
    });

    if (recipients.length === 0)
      return NextResponse.json({ error: "no recipients" }, { status: 400 });

    // ⑤ 重複配信防止
    const { data: already } = await sb
      .from("deliveries")
      .select("recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in("status", ["scheduled", "queued", "sent"]);
    const exclude = new Set((already ?? []).map((d: any) => d.recipient_id));
    const targets = recipients.filter((r) => !exclude.has(r.id));
    if (targets.length === 0)
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: recipientIds.length,
      });

    // ⑥ 予約 or 即時
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

    // ⑦ deliveries upsert（大きい場合は分割）
    if (scheduleAt) {
      for (const part of chunk(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "scheduled" as const,
          scheduled_at: scheduleAt,
        })),
        500
      )) {
        await sb.from("deliveries").upsert(part, {
          onConflict: "campaign_id,recipient_id",
        });
      }
      await sb
        .from("campaigns")
        .update({ status: "scheduled" })
        .eq("id", campaignId);
    } else {
      for (const part of chunk(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "queued" as const,
          scheduled_at: null as any,
        })),
        500
      )) {
        await sb.from("deliveries").upsert(part, {
          onConflict: "campaign_id,recipient_id",
        });
      }
      await sb
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", campaignId);
    }

    // ⑧ delivery_id ←→ recipient_id map（開封ピクセル）
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
      idMap.set(String(d.recipient_id), String(d.id))
    );

    const fromOverride =
      (cfg.fromOverride as string | undefined) ||
      ((camp as any).from_email as string | undefined) ||
      undefined;

    // ⑨ BullMQ投入（Renderのワーカーが direct_email を処理）
    let queued = 0;
    for (const r of targets) {
      const deliveryId = idMap.get(String(r.id)) ?? "";
      const pixelUrl = `${appUrl}/api/email/open?id=${encodeURIComponent(
        deliveryId
      )}`;
      const htmlWithPixel = injectOpenPixel(htmlBody ?? "", pixelUrl);

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: String(r.email),
        subject: String((camp as any).subject ?? ""),
        html: htmlWithPixel,
        text: ((camp as any).text as string | null) ?? undefined,
        tenantId,
        unsubscribeToken: (r as any).unsubscribe_token ?? undefined,
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

    return NextResponse.json({
      ok: true,
      queued,
      scheduled: scheduleAt ?? null,
      fromOverride: fromOverride ?? null,
    });
  } catch (e: any) {
    console.error("POST /api/campaigns/send error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
