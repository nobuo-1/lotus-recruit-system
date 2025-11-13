// web/src/app/api/form-outreach/manual/send/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { emailQueue } from "@/server/queue";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/* ========= Supabase REST ========= */
const REST_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
  : "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CAN_USE_REST = !!(REST_URL && (SERVICE || ANON));

function authHeaders() {
  const token = SERVICE || ANON;
  return {
    apikey: ANON || token,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

type SenderRow = {
  id: string;
  sender_company: string | null; // 追加：会社名 {{sender_company}}
  from_name: string | null; // 個人名 {{sender_name}}
  from_email: string | null;
  reply_to: string | null;
  phone: string | null;
  website: string | null;
  signature: string | null;
  is_default: boolean | null;
};

type TemplateRow = {
  id: string;
  name: string | null;
  subject: string | null;
  body_text: string | null;
  body_html?: string | null;
};

type ProspectBase = {
  id: string;
  contact_form_url?: string | null;
  contact_email?: string | null;
};
type ProspectA = ProspectBase & {
  company_name?: string | null;
  website?: string | null;
  // form_prospects / form_prospects_rejected 用の都道府県
  prefectures?: string[] | null;
};
type ProspectB = ProspectBase & {
  target_company_name?: string | null;
  found_company_name?: string | null;
  found_website?: string | null;
  // form_prospects_rejected にも prefectures がある
  prefectures?: string[] | null;
};
type AnyRow = ProspectA | ProspectB;

/* ========= Helpers ========= */
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function textToHtml(text: string) {
  // 改行→<br>（本文はテキスト起点なのでエスケープ前提）
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}
function pickCompanyName(r: AnyRow) {
  return (
    (r as any).company_name ||
    (r as any).target_company_name ||
    (r as any).found_company_name ||
    "-"
  );
}
function pickWebsite(r: AnyRow) {
  return (r as any).website || (r as any).found_website || "";
}
function pickPrefecture(r: AnyRow): string {
  const arr = (r as any).prefectures as string[] | null | undefined;
  if (Array.isArray(arr) && arr.length > 0) {
    return arr[0] || "";
  }
  return "";
}
function replaceAllKeys(src: string, dict: Record<string, string>) {
  let out = src || "";
  for (const [k, v] of Object.entries(dict)) {
    const re = new RegExp(
      String(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    );
    out = out.replace(re, v);
  }
  return out;
}

/* ========= Loaders (REST or SDK fallback) ========= */
async function loadTemplate(tenantId: string, templateId: string) {
  if (CAN_USE_REST) {
    const url =
      `${REST_URL}/form_outreach_messages?select=id,name,subject,body_text,body_html` +
      `&tenant_id=eq.${tenantId}&id=eq.${templateId}&limit=1`;
    const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    if (!r.ok)
      throw new Error(`template fetch error ${r.status}: ${await r.text()}`);
    const rows = (await r.json()) as unknown as TemplateRow[];
    if (!rows?.length) throw new Error("template not found");
    return rows[0];
  } else {
    const sb = await supabaseServer();
    const { data, error } = await sb
      .from("form_outreach_messages")
      .select("id,name,subject,body_text,body_html")
      .eq("tenant_id", tenantId)
      .eq("id", templateId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("template not found");
    return data as TemplateRow;
  }
}

async function loadSender(tenantId: string): Promise<SenderRow | null> {
  if (CAN_USE_REST) {
    const url =
      `${REST_URL}/form_outreach_senders?select=id,sender_company,from_name,from_email,reply_to,phone,website,signature,is_default` +
      `&tenant_id=eq.${tenantId}&is_default=is.true&limit=1`;
    const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    if (!r.ok) return null;
    const rows = (await r.json()) as unknown as SenderRow[];
    return rows?.[0] ?? null;
  } else {
    const sb = await supabaseServer();
    const { data, error } = await sb
      .from("form_outreach_senders")
      .select(
        "id,sender_company,from_name,from_email,reply_to,phone,website,signature,is_default"
      )
      .eq("tenant_id", tenantId)
      .eq("is_default", true)
      .limit(1);
    if (error) return null;
    return (data ?? [])[0] ?? null;
  }
}

/** テーブルごとに存在するカラムのみを選択する */
function selectColsFor(table: string) {
  switch (table) {
    case "form_similar_sites":
      return [
        "id",
        "target_company_name",
        "found_company_name",
        "found_website",
        "contact_form_url",
        "contact_email",
      ].join(",");
    case "form_prospects_rejected":
      return [
        "id",
        "company_name",
        "website",
        "contact_form_url",
        "contact_email",
        "prefectures",
      ].join(",");
    case "form_prospects":
    default:
      return [
        "id",
        "company_name",
        "website",
        "contact_form_url",
        "contact_email",
        "prefectures",
      ].join(",");
  }
}

async function loadProspects(
  tenantId: string,
  tableName: string,
  ids: string[]
) {
  const table =
    tableName === "form_prospects" ||
    tableName === "form_prospects_rejected" ||
    tableName === "form_similar_sites"
      ? tableName
      : "form_prospects";

  const selectCols = selectColsFor(table);

  if (CAN_USE_REST) {
    const idCsv = ids.join(",");
    const url =
      `${REST_URL}/${table}?select=${selectCols}` +
      `&tenant_id=eq.${tenantId}&id=in.(${idCsv})&limit=${ids.length}`;
    const r = await fetch(encodeURI(url), {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!r.ok)
      throw new Error(`prospects fetch error ${r.status}: ${await r.text()}`);
    const rows = (await r.json()) as unknown as AnyRow[];
    return rows;
  } else {
    const sb = await supabaseServer();
    const { data, error } = await sb
      .from(table)
      .select(selectCols)
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as AnyRow[];
    return rows;
  }
}

/* ========= Runs insert/update ========= */
async function insertRun(
  tenantId: string,
  payload: {
    flow: string;
    status: string;
    error?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
  }
) {
  if (CAN_USE_REST) {
    const url = `${REST_URL}/form_outreach_runs`;
    const r = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify([{ tenant_id: tenantId, ...payload }]),
    });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => null);
    return rows?.[0] ?? null;
  } else {
    const sb = await supabaseServer();
    const { data, error } = await sb
      .from("form_outreach_runs")
      .insert({ tenant_id: tenantId, ...payload })
      .select()
      .maybeSingle();
    if (error) return null;
    return data ?? null;
  }
}

async function updateRun(
  id: string,
  patch: { status?: string; error?: string | null; finished_at?: string }
) {
  if (CAN_USE_REST) {
    const url = `${REST_URL}/form_outreach_runs?id=eq.${id}`;
    await fetch(url, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(patch),
    }).catch(() => {});
  } else {
    const sb = await supabaseServer();
    await sb.from("form_outreach_runs").update(patch).eq("id", id);
  }
}

/* ========= Queue ========= */
async function enqueueDirectEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  brandCompany: string;
  fromOverride?: string | null;
  brandSupport?: string | null;
}) {
  const name = `direct:${Date.now()}:${randomUUID()}`;
  await emailQueue.add(
    name,
    {
      kind: "direct_email",
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      brandCompany: args.brandCompany,
      fromOverride: args.fromOverride || undefined,
      brandSupport: args.brandSupport || undefined,
    },
    { removeOnComplete: 500, removeOnFail: 500 }
  );
}

/* ========= Main ========= */
export async function POST(req: NextRequest) {
  const nowIso = new Date().toISOString();

  try {
    const tenantId =
      req.headers.get("x-tenant-id")?.trim() ??
      "175b1a9d-3f85-482d-9323-68a44d214424";
    const body = await req.json().catch(() => ({}));

    const {
      table = "form_prospects",
      template_id,
      prospect_ids = [],
      unknown_placeholder = "メッセージをご確認ください",
      channel = "email",
    } = body || {};

    if (!template_id)
      return NextResponse.json(
        { error: "template_id is required" },
        { status: 400 }
      );
    if (!Array.isArray(prospect_ids) || prospect_ids.length === 0)
      return NextResponse.json(
        { error: "prospect_ids is empty" },
        { status: 400 }
      );

    const run = await insertRun(tenantId, {
      flow: `manual-send/${channel}`,
      status: "running",
      started_at: nowIso,
    });

    const [tpl, sender, targets] = await Promise.all([
      loadTemplate(tenantId, String(template_id)),
      loadSender(tenantId),
      loadProspects(tenantId, String(table), prospect_ids.map(String)),
    ]);

    // 会社名／担当者名の優先順位
    const senderCompany =
      (sender?.sender_company && sender.sender_company.trim()) || null;
    const senderPersonName =
      (sender?.from_name && sender.from_name.trim()) || null;

    const brandCompany = senderCompany || senderPersonName || "Lotus System"; // キュー用ブランド表示

    const replyTo = sender?.reply_to || null;
    const support = sender?.from_email || null;
    const signature = sender?.signature || "";

    const senderDict: Record<string, string> = {
      // 会社名プレースホルダ
      "{{sender_company}}": senderCompany || brandCompany,
      // 担当者名プレースホルダ
      "{{sender_name}}": senderPersonName || brandCompany,
      "{{sender_email}}": sender?.from_email || "",
      "{{sender_reply_to}}": sender?.reply_to || "",
      "{{sender_phone}}": sender?.phone || "",
      "{{sender_website}}": sender?.website || "",
      "{{signature}}": signature || "",
      "{{today}}": nowIso.slice(0, 10),
    };

    const ok: string[] = [];
    const queued: string[] = [];
    const failed: string[] = [];

    for (const r of targets) {
      try {
        const recipientCompany = String(pickCompanyName(r) || "-");
        const website = String(pickWebsite(r) || "");
        const prefecture = String(pickPrefecture(r) || "");
        const formUrl = String((r as any).contact_form_url || "");
        const toEmail = String((r as any).contact_email || "");

        const ctx: Record<string, string> = {
          ...senderDict,
          "{{recipient_company}}": recipientCompany,
          "{{website}}": website,
          "{{recipient_prefecture}}": prefecture,
        };

        const subject = replaceAllKeys(tpl.subject || "", ctx) || "(件名なし)";
        const baseText = replaceAllKeys(tpl.body_text || "", ctx);
        const withSignatureText = signature
          ? `${baseText}\n\n${signature}`
          : baseText;

        const baseHtmlRaw =
          tpl.body_html && tpl.body_html.trim().length > 0
            ? replaceAllKeys(tpl.body_html, ctx)
            : textToHtml(withSignatureText);

        const finalHtml = baseHtmlRaw;
        const finalText = withSignatureText;

        if (channel === "email") {
          if (!toEmail) {
            await enqueueWaitlist(tenantId, {
              table_name: String(table),
              prospect_id: String(r.id),
              reason: "no_email",
              payload: {
                context: { recipient_company: recipientCompany },
                form_url: formUrl || null,
              },
            });
            queued.push(String(r.id));
            continue;
          }

          await enqueueDirectEmail({
            to: toEmail,
            subject,
            html: finalHtml,
            text: finalText,
            brandCompany,
            fromOverride: replyTo,
            brandSupport: support,
          });
          ok.push(String(r.id));
        } else if (channel === "form") {
          if (!formUrl) {
            await enqueueWaitlist(tenantId, {
              table_name: String(table),
              prospect_id: String(r.id),
              reason: "no_form",
              payload: {
                context: {
                  recipient_company: recipientCompany,
                  message: finalText || baseText || unknown_placeholder,
                },
              },
            });
            queued.push(String(r.id));
            continue;
          }

          await enqueueWaitlist(tenantId, {
            table_name: String(table),
            prospect_id: String(r.id),
            reason: "queue_form",
            payload: {
              context: {
                recipient_company: recipientCompany,
                message: finalText || baseText || unknown_placeholder,
              },
              form_url: formUrl,
            },
          });
          queued.push(String(r.id));
        } else {
          failed.push(String(r.id));
        }
      } catch (e) {
        failed.push(String((r as any).id));
      }
    }

    if (run?.id) {
      const status =
        failed.length === 0
          ? "done"
          : ok.length > 0 || queued.length > 0
          ? "partial"
          : "failed";
      await updateRun(run.id, {
        status,
        error: failed.length ? `failed: ${failed.length}` : null,
        finished_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok, queued, failed });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/* ========= 待機リスト API 呼び出し ========= */
async function enqueueWaitlist(
  tenantId: string,
  row: {
    table_name: string;
    prospect_id: string;
    reason: string;
    payload?: any;
  }
) {
  if (CAN_USE_REST) {
    const url = `${REST_URL}/form_outreach_waitlist`;
    const r = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify([{ tenant_id: tenantId, ...row }]),
    });
    if (!r.ok)
      throw new Error(`waitlist insert error ${r.status}: ${await r.text()}`);
  } else {
    const sb = await supabaseServer();
    const { error } = await sb
      .from("form_outreach_waitlist")
      .insert({ tenant_id: tenantId, ...row });
    if (error) throw new Error(error.message);
  }
}
