// web/src/app/api/form-outreach/manual/send/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { emailQueue } from "@/server/queue";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/* ========= Supabase REST ========= */
const REST_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function authHeaders() {
  const token = SERVICE || ANON;
  return {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

type SenderRow = {
  id: string;
  from_name: string | null;
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

type AnyRow =
  | {
      id: string;
      company_name?: string | null;
      website?: string | null;
      contact_form_url?: string | null;
      contact_email?: string | null;
      [k: string]: any;
    }
  | {
      id: string;
      target_company_name?: string | null;
      found_company_name?: string | null;
      found_website?: string | null;
      contact_form_url?: string | null;
      contact_email?: string | null;
      [k: string]: any;
    };

/* ========= Helpers ========= */

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(text: string) {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

function pickCompanyName(r: AnyRow) {
  return r.company_name || r.target_company_name || r.found_company_name || "-";
}

function pickWebsite(r: AnyRow) {
  return r.website || (r as any).found_website || "";
}

function replaceAllKeys(src: string, dict: Record<string, string>) {
  let out = src;
  for (const [k, v] of Object.entries(dict)) {
    const re = new RegExp(
      String(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    );
    out = out.replace(re, v);
  }
  return out;
}

async function loadTemplate(tenantId: string, templateId: string) {
  const url =
    `${REST_URL}/form_outreach_messages?select=id,name,subject,body_text,body_html` +
    `&tenant_id=eq.${tenantId}&id=eq.${templateId}&limit=1`;
  const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`template fetch error ${r.status}: ${t}`);
  }
  const rows = (await r.json()) as TemplateRow[];
  if (!rows?.length) throw new Error("template not found");
  return rows[0];
}

async function loadSender(tenantId: string): Promise<SenderRow | null> {
  const url =
    `${REST_URL}/form_outreach_senders?select=id,from_name,from_email,reply_to,phone,website,signature,is_default` +
    `&tenant_id=eq.${tenantId}&is_default=is.true&limit=1`;
  const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  if (!r.ok) return null;
  const rows = (await r.json()) as SenderRow[];
  return rows?.[0] ?? null;
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
  const idCsv = ids.map((x) => x).join(",");
  const selectCols =
    "id,company_name,website,contact_form_url,contact_email," +
    "target_company_name,found_company_name,found_website";
  const url =
    `${REST_URL}/${table}?select=${selectCols}` +
    `&tenant_id=eq.${tenantId}&id=in.(${idCsv})&limit=${ids.length}`;
  const r = await fetch(encodeURI(url), {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`prospects fetch error ${r.status}: ${t}`);
  }
  const rows = (await r.json()) as AnyRow[];
  return rows;
}

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
  const url = `${REST_URL}/form_outreach_runs`;
  const body = [{ tenant_id: tenantId, ...payload }];
  const r = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => null);
  return rows?.[0] ?? null;
}

async function updateRun(
  id: string,
  patch: { status?: string; error?: string | null; finished_at?: string }
) {
  const url = `${REST_URL}/form_outreach_runs?id=eq.${id}`;
  await fetch(url, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  }).catch(() => {});
}

/* ★ 修正点：kind を "direct_email" に統一 ★ */
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
      kind: "direct_email", // ← ここを修正（型: "direct_email" | "campaign_send"）
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

    const brandCompany =
      (sender?.from_name && sender.from_name.trim()) || "Lotus System";
    const replyTo = sender?.reply_to || null;
    const support = sender?.from_email || null;
    const signature = sender?.signature || "";

    const senderDict: Record<string, string> = {
      "{{sender_company}}": brandCompany,
      "{{sender_name}}": brandCompany,
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
        const formUrl = String((r as any).contact_form_url || "");
        const toEmail = String((r as any).contact_email || "");

        const ctx: Record<string, string> = {
          ...senderDict,
          "{{recipient_company}}": recipientCompany,
          "{{website}}": website,
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
      } catch {
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
  const url = `${REST_URL}/form_outreach_waitlist`;
  const r = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify([{ tenant_id: tenantId, ...row }]),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`waitlist insert error ${r.status}: ${t}`);
  }
}
