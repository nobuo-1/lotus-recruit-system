// web/src/app/api/campaigns/send/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Vercel で Node ランタイムを強制
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

type Payload = {
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null;
};

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

/** OPTIONS: CORS & プリフライト（405回避） */
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

/** /email/settings（user優先→tenant→tenants）から送信元/ブランド設定をロード */
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

  if (byUser?.data) {
    const d: any = byUser.data;
    from_address = d.from_address ?? from_address;
    brand_company = d.brand_company ?? brand_company;
    brand_address = d.brand_address ?? brand_address;
    brand_support = d.brand_support ?? brand_support;
  }

  // tenant 設定
  if (tenantId) {
    const byTenant = await sb
      .from("email_settings")
      .select("from_address,brand_company,brand_address,brand_support")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (byTenant?.data) {
      const d: any = byTenant.data;
      from_address = from_address ?? d.from_address;
      brand_company = brand_company ?? d.brand_company;
      brand_address = brand_address ?? d.brand_address;
      brand_support = brand_support ?? d.brand_support;
    }

    // tenants 表のフォールバック
    const { data: tenantRow } = await sb
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRow) {
      const t: any = tenantRow;
      from_address = from_address ?? t.from_email ?? undefined;
      brand_company = brand_company ?? t.company_name ?? undefined;
      brand_address = brand_address ?? t.company_address ?? undefined;
      brand_support = brand_support ?? t.support_email ?? undefined;
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

/** </body> の直前へ 1px ピクセルを差し込む（無ければ末尾） */
function injectOpenPixel(html: string, url: string) {
  const pixel = `<img src="${url}" alt="" width="1" height="1" style="display:none;max-width:1px;max-height:1px;" />`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${pixel}\n</body>`)
    : `${html}\n${pixel}`;
}

/** 安全に JSON を読む（空ボディでも落ちない） */
async function safeJson<T = any>(req: Request): Promise<T | {}> {
  try {
    if (!req.headers.get("content-length")) return {};
    return (await req.json()) as T;
  } catch {
    return {};
  }
}

/** 配列を n 件ずつに分割（DB upsert のバッチ用） */
function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
}

export async function POST(req: Request) {
  try {
    const body = (await safeJson<Partial<Payload>>(req)) as Partial<Payload>;
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
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { tenantId, cfg } = await loadSenderConfigForCurrentUser();
    if (!tenantId) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    // キャンペーン（本文は html / body_html のどちらでも）
    const { data: camp, error: ce } = await supabase
      .from("campaigns")
      .select(
        "id, tenant_id, subject, html, body_html, text, from_email, status"
      )
      .eq("id", campaignId)
      .maybeSingle();

    if (ce || !camp || (camp as any).tenant_id !== tenantId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const htmlBody = (camp as any).html ?? (camp as any).body_html ?? "";

    // 受信者（列は optional に扱う）
    const { data: recs } = await supabase
      .from("recipients")
      .select(
        "id, email, unsubscribe_token, is_active, consent, unsubscribed_at, disabled"
      )
      .eq("tenant_id", tenantId)
      .in("id", recipientIds);

    const recipients = (recs ?? []).filter((r: any) => {
      if (!r?.email) return false;
      if (r?.disabled === true) return false; // 無い環境では undefined → 通過
      if (r?.unsubscribed_at) return false;
      if (r?.is_active === false) return false; // 無い環境では undefined → 通過
      if (r?.consent === "opt_out") return false; // 無い環境では undefined → 通過
      return true;
    });
    if (recipients.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    // 二重配信防止
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
      if (Number.isNaN(ts)) {
        return NextResponse.json(
          { error: "scheduleAt が不正です" },
          { status: 400 }
        );
      }
      delay = Math.max(0, ts - now);
      scheduleAt = new Date(ts).toISOString();
    }

    // deliveries を upsert
    if (scheduleAt) {
      await supabase.from("deliveries").upsert(
        targets.map((r: any) => ({
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
        targets.map((r: any) => ({
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

    // delivery_id ↔ recipient_id 取得（開封ピクセル用）
    const { data: dels } = await supabase
      .from("deliveries")
      .select("id, recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in(
        "recipient_id",
        targets.map((t: any) => t.id)
      );
    const idMap = new Map<string, string>();
    (dels ?? []).forEach((d: any) =>
      idMap.set(String(d.recipient_id), String(d.id))
    );

    // 差出人（設定 > キャンペーン > no-reply の順）
    const fromOverride =
      (cfg.fromOverride as string | undefined) ||
      ((camp as any).from_email as string | undefined) ||
      undefined;

    // キュー投入（既存ワーカーと互換）
    let queued = 0;
    for (const r of targets as any[]) {
      const deliveryId = idMap.get(String(r.id));
      const pixelUrl = `${appUrl}/api/email/open?id=${encodeURIComponent(
        deliveryId ?? ""
      )}`;
      const htmlWithPixel = injectOpenPixel(htmlBody ?? "", pixelUrl);

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: String(r.email),
        subject: String((camp as any).subject ?? ""),
        html: htmlWithPixel,
        text: ((camp as any).text as string | null) ?? undefined,
        tenantId,
        unsubscribeToken: r.unsubscribe_token ?? undefined,
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

    // 予約の一覧用
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
