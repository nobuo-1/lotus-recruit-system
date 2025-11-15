// web/src/app/api/form-outreach/manual/send/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { emailQueue } from "@/server/queue";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  planFormSubmission,
  submitFormPlan,
  judgeFormSubmissionResult,
  detectCaptchaFromHtml,
} from "@/server/formOutreachFormSender";
import type { FormPlan } from "@/server/formOutreachFormSender";

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

/* ========= Types ========= */
type SenderRow = {
  id: string;
  sender_company: string | null; // 会社名（{{sender_company}})
  from_name: string | null; // 個人名/担当者名（{{sender_name}})
  from_header_name: string | null; // From: 表示名
  from_email: string | null;
  reply_to: string | null;
  phone: string | null;
  website: string | null;
  signature: string | null;
  is_default: boolean | null;

  // ★ フォーム営業用 住所・氏名
  postal_code?: string | null;
  sender_prefecture?: string | null;
  sender_address?: string | null;
  sender_last_name?: string | null;
  sender_first_name?: string | null;
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
  email_sent?: boolean | null;
  form_sent?: boolean | null;
};

type ProspectProspects = ProspectBase & {
  company_name?: string | null;
  website?: string | null;
  industry?: string | null;
  prefectures?: string[] | null;
};

type ProspectRejected = ProspectBase & {
  company_name?: string | null;
  website?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  prefectures?: string[] | null;
};

type ProspectSimilar = ProspectBase & {
  target_company_name?: string | null;
  found_company_name?: string | null;
  found_website?: string | null;
};

type AnyRow = ProspectProspects | ProspectRejected | ProspectSimilar;

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
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : "";
}

function pickIndustry(r: AnyRow): string {
  const a = (r as any).industry as string | null | undefined;
  const b = (r as any).industry_small as string | null | undefined;
  const c = (r as any).industry_large as string | null | undefined;
  return a || b || c || "";
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

/* ========= HTML だけからの粗いフォーム解析（デバッグ用） ========= */

type HtmlFormRoughStats = {
  formCount: number;
  inputCount: number; // hidden / submit なども含む全 input
  textInputCount: number; // hidden / submit / button / image / reset を除外した input
  checkboxCount: number;
  selectCount: number;
  textareaCount: number;
  hasSubmitLikeButton: boolean;
};

/**
 * Playwright が動かなくても、HTML だけから
 * - form タグの数
 * - input/select/checkbox/textarea の数
 * - 「送信っぽいボタン」がありそうか
 * をざっくり取るヘルパー
 */
function analyzeFormHtml(html: string): HtmlFormRoughStats {
  const lower = html.toLowerCase();

  const formCount = (lower.match(/<form\b/g) || []).length;

  const inputTagRegex = /<input\b[^>]*>/gi;
  let inputMatch: RegExpExecArray | null;
  let inputCount = 0;
  let textInputCount = 0;
  let checkboxCount = 0;

  while ((inputMatch = inputTagRegex.exec(html)) !== null) {
    inputCount++;
    const tag = inputMatch[0];
    const typeMatch = tag.match(/type\s*=\s*["']?([^"'\s>]+)/i);
    const type = (typeMatch?.[1] || "").toLowerCase();

    if (type === "checkbox") {
      checkboxCount++;
      continue;
    }

    // 通常のテキスト系 input
    if (
      type !== "hidden" &&
      type !== "submit" &&
      type !== "button" &&
      type !== "image" &&
      type !== "reset"
    ) {
      textInputCount++;
    }
  }

  const selectCount = (lower.match(/<select\b[^>]*>/g) || []).length;
  const textareaCount = (lower.match(/<textarea\b[^>]*>/g) || []).length;

  // 「送信 / 確認 / submit / confirm」っぽいラベルがあり、
  // かつボタン系タグがページに存在していれば true
  const hasAnyButtonTag =
    /<(button|input)\b[^>]*(type\s*=\s*["']?(submit|button)["']?)?[^>]*>/i.test(
      lower
    );
  const hasSubmitWord =
    /送信|確認|submit|confirm/.test(lower) && hasAnyButtonTag;

  return {
    formCount,
    inputCount,
    textInputCount,
    checkboxCount,
    selectCount,
    textareaCount,
    hasSubmitLikeButton: hasSubmitWord,
  };
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
      `${REST_URL}/form_outreach_senders?select=id,sender_company,from_name,from_header_name,from_email,reply_to,phone,website,signature,is_default,postal_code,sender_prefecture,sender_address,sender_last_name,sender_first_name` +
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
        "id,sender_company,from_name,from_header_name,from_email,reply_to,phone,website,signature,is_default,postal_code,sender_prefecture,sender_address,sender_last_name,sender_first_name"
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
        "email_sent",
        "form_sent",
      ].join(",");
    case "form_prospects_rejected":
      return [
        "id",
        "company_name",
        "website",
        "contact_form_url",
        "contact_email",
        "industry_large",
        "industry_small",
        "prefectures",
        "email_sent",
        "form_sent",
      ].join(",");
    case "form_prospects":
    default:
      return [
        "id",
        "company_name",
        "website",
        "contact_form_url",
        "contact_email",
        "industry",
        "prefectures",
        "email_sent",
        "form_sent",
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
  brandCompany: string; // From 表示名
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

/* ========= Prospect sent flags ========= */

async function markProspectChannelSent(
  tenantId: string,
  tableName: string,
  id: string,
  channel: "email" | "form"
) {
  const table =
    tableName === "form_prospects" ||
    tableName === "form_prospects_rejected" ||
    tableName === "form_similar_sites"
      ? tableName
      : "form_prospects";

  const patch: Record<string, any> = {};
  if (channel === "email") patch.email_sent = true;
  if (channel === "form") patch.form_sent = true;

  if (CAN_USE_REST) {
    const url = `${REST_URL}/${table}?tenant_id=eq.${tenantId}&id=eq.${id}`;
    await fetch(url, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(patch),
    }).catch(() => {});
  } else {
    const sb = await supabaseServer();
    await sb.from(table).update(patch).eq("tenant_id", tenantId).eq("id", id);
  }
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
      mode,
      channel: bodyChannel,
    } = body || {};

    // フロントからは mode: "email" | "form" が来る想定だが、
    // 互換のため channel も受け付ける
    const channel: "email" | "form" =
      mode === "form" || bodyChannel === "form" ? "form" : "email";

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

    const senderCompany = (sender?.sender_company || "").trim();
    const senderName = (sender?.from_name || "").trim();

    // メールの From: に表示する名前
    const brandCompany =
      (sender?.from_header_name || "").trim() ||
      senderCompany ||
      senderName ||
      "Lotus System";

    const replyTo = sender?.reply_to || null;
    const support = sender?.from_email || null;
    const signature = sender?.signature || "";

    // ★ 送信元差し込み：署名は自動でくっつけず、{{signature}} を書いた時だけ反映
    const senderDict: Record<string, string> = {
      "{{sender_company}}": senderCompany || brandCompany,
      "{{sender_name}}": senderName || brandCompany,
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

    // ★ prospect_id ごとのフォーム送信デバッグ情報
    const debugByProspect: Record<string, any> = {};

    for (const r of targets) {
      try {
        const recipientCompany = String(pickCompanyName(r) || "-");
        const website = String(pickWebsite(r) || "");
        const recipientPref = String(pickPrefecture(r) || "");
        const recipientIndustry = String(pickIndustry(r) || "");
        const formUrl = String((r as any).contact_form_url || "");
        const toEmail = String((r as any).contact_email || "");

        const ctx: Record<string, string> = {
          ...senderDict,
          "{{recipient_company}}": recipientCompany,
          "{{recipient_prefecture}}": recipientPref,
          "{{recipient_industry}}": recipientIndustry,
          "{{website}}": website,
        };

        const subject = replaceAllKeys(tpl.subject || "", ctx) || "(件名なし)";
        const baseText = replaceAllKeys(tpl.body_text || "", ctx);

        // ★ 署名は自動で末尾に付与しない（{{signature}} を書いたところだけに入る）
        const finalText = baseText;

        const baseHtmlRaw =
          tpl.body_html && tpl.body_html.trim().length > 0
            ? replaceAllKeys(tpl.body_html, ctx)
            : textToHtml(finalText || unknown_placeholder);

        const finalHtml = baseHtmlRaw;
        const messageText = finalText || baseText || unknown_placeholder;

        if (channel === "email") {
          if (!toEmail) {
            await enqueueWaitlist(tenantId, {
              table_name: String(table),
              prospect_id: String(r.id),
              reason: "no_email",
              payload: {
                context: {
                  recipient_company: recipientCompany,
                  recipient_prefecture: recipientPref,
                  recipient_industry: recipientIndustry,
                },
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

          await markProspectChannelSent(
            tenantId,
            String(table),
            String(r.id),
            "email"
          );
          ok.push(String(r.id));
        } else if (channel === "form") {
          // ★ この prospect 専用のデバッグ器
          const debugForThis: any = {
            canAccessForm: false,
            hasCaptcha: null,
            // Playwright / HTML 解析共通のメトリクス
            inputTotal: null,
            inputFilled: null,
            selectTotal: null,
            selectFilled: null,
            checkboxTotal: null,
            checkboxFilled: null,
            hasActionButton: null,
            clickedConfirm: null,
            clickedSubmit: null,
            // HTML 粗解析用
            htmlFormCount: null,
            htmlInputCount: null,
            htmlTextInputCount: null,
            htmlSelectCount: null,
            htmlCheckboxCount: null,
            htmlTextareaCount: null,
            htmlHasSubmitLikeButton: null,
            sentStatus: "unknown",
          };

          if (!formUrl) {
            debugForThis.sentStatus = "no_form_url";
            debugByProspect[String(r.id)] = debugForThis;

            await enqueueWaitlist(tenantId, {
              table_name: String(table),
              prospect_id: String(r.id),
              reason: "no_form",
              payload: {
                context: {
                  recipient_company: recipientCompany,
                  recipient_prefecture: recipientPref,
                  recipient_industry: recipientIndustry,
                  message: messageText,
                },
                form_url: null,
                note: "contact_form_url が空のため、自動フォーム送信できませんでした。",
              },
            });
            queued.push(String(r.id));
            continue;
          }

          try {
            // 1. フォームHTML取得（Cookie / UA を付けてブラウザっぽく）
            const pageRes = await fetch(formUrl, {
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) LotusRecruitBot/1.0 Chrome/120.0.0.0 Safari/537.36",
                Accept:
                  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ja,en;q=0.8",
              },
            });
            if (!pageRes.ok) {
              throw new Error(`form page fetch error: ${pageRes.status}`);
            }

            debugForThis.canAccessForm = true;

            const html = await pageRes.text();
            const cookieHeader = pageRes.headers.get("set-cookie") ?? undefined;

            const hasCaptcha = detectCaptchaFromHtml(html);
            debugForThis.hasCaptcha = hasCaptcha;

            // 1-2. HTML だけから粗いフォーム構造を解析（Playwright 以前のステップ）
            try {
              const rough = analyzeFormHtml(html);

              debugForThis.htmlFormCount = rough.formCount;
              debugForThis.htmlInputCount = rough.inputCount;
              debugForThis.htmlTextInputCount = rough.textInputCount;
              debugForThis.htmlSelectCount = rough.selectCount;
              debugForThis.htmlCheckboxCount = rough.checkboxCount;
              debugForThis.htmlTextareaCount = rough.textareaCount;
              debugForThis.htmlHasSubmitLikeButton = rough.hasSubmitLikeButton;

              // もし後段の Playwright がコケても、最低限ここから数値が見えるようにする
              if (debugForThis.inputTotal == null) {
                debugForThis.inputTotal = rough.textInputCount;
              }
              if (debugForThis.selectTotal == null) {
                debugForThis.selectTotal = rough.selectCount;
              }
              if (debugForThis.checkboxTotal == null) {
                debugForThis.checkboxTotal = rough.checkboxCount;
              }
              if (debugForThis.hasActionButton == null) {
                debugForThis.hasActionButton = rough.hasSubmitLikeButton;
              }
            } catch (e) {
              // 粗解析に失敗しても致命的ではないので握りつぶす
              console.warn("[form-debug] analyzeFormHtml error", e);
            }

            // ★ CAPTCHA があればここで即スキップ（自動送信は完全に諦める）
            if (hasCaptcha) {
              debugForThis.sentStatus = "captcha";
              debugByProspect[String(r.id)] = debugForThis;

              await enqueueWaitlist(tenantId, {
                table_name: String(table),
                prospect_id: String(r.id),
                reason: "recaptcha",
                payload: {
                  context: {
                    recipient_company: recipientCompany,
                    recipient_prefecture: recipientPref,
                    recipient_industry: recipientIndustry,
                    message: messageText,
                  },
                  form_url: formUrl,
                  note: "reCAPTCHA/hCaptcha が検出されたため、自動送信をスキップしました。",
                },
              });
              queued.push(String(r.id));
              continue;
            }

            // 2. ChatGPT にフォーム入力プランを作成させる
            //    （失敗しても throw させず null のまま Playwright に進む）
            let plan: FormPlan | null = null;
            try {
              plan = await planFormSubmission({
                targetUrl: formUrl,
                html,
                message: messageText,
                sender: {
                  company:
                    sender?.sender_company || senderCompany || brandCompany,
                  postal_code: sender?.postal_code || "",
                  prefecture: sender?.sender_prefecture || "",
                  address: sender?.sender_address || "",
                  last_name: sender?.sender_last_name || senderName || "",
                  first_name: sender?.sender_first_name || "",
                  email: sender?.from_email || "",
                  phone: sender?.phone || "",
                  website: sender?.website || "",
                },
                recipient: {
                  company_name: recipientCompany,
                  website,
                  industry: recipientIndustry,
                  prefecture: recipientPref,
                },
              });
            } catch (e) {
              console.warn(
                "[form-plan] planFormSubmission error (ignored):",
                e
              );
              plan = null;
            }

            // 3. 実際にフォーム送信（★ plan が null でも Playwright のヒューリスティックのみで送信を試す）
            const result = await submitFormPlan(formUrl, plan, cookieHeader);

            if (result.debug) {
              const d = result.debug as any;
              // Playwright 側で得られた情報で上書き（あれば）
              if (typeof d.inputTotal === "number") {
                debugForThis.inputTotal = d.inputTotal;
              }
              if (typeof d.inputFilled === "number") {
                debugForThis.inputFilled = d.inputFilled;
              }
              if (typeof d.selectTotal === "number") {
                debugForThis.selectTotal = d.selectTotal;
              }
              if (typeof d.selectFilled === "number") {
                debugForThis.selectFilled = d.selectFilled;
              }
              if (typeof d.checkboxTotal === "number") {
                debugForThis.checkboxTotal = d.checkboxTotal;
              }
              if (typeof d.checkboxFilled === "number") {
                debugForThis.checkboxFilled = d.checkboxFilled;
              }
              if (typeof d.hasActionButton === "boolean") {
                debugForThis.hasActionButton = d.hasActionButton;
              }
              if (typeof d.clickedConfirm === "boolean") {
                debugForThis.clickedConfirm = d.clickedConfirm;
              }
              if (typeof d.clickedSubmit === "boolean") {
                debugForThis.clickedSubmit = d.clickedSubmit;
              }
            }

            // 4. 結果HTMLから「送信成功かどうか」を判定
            const judge = await judgeFormSubmissionResult({
              url: result.url,
              html: result.html,
            });

            debugForThis.sentStatus = judge;

            if (judge === "success") {
              // 明らかに送信成功と判断できたときだけ form_sent を true にする
              await markProspectChannelSent(
                tenantId,
                String(table),
                String(r.id),
                "form"
              );
              ok.push(String(r.id));
            } else {
              // 失敗・不明は待機リストに積んで queued 扱い（あとで人間が確認）
              await enqueueWaitlist(tenantId, {
                table_name: String(table),
                prospect_id: String(r.id),
                reason: "queue_form",
                payload: {
                  context: {
                    recipient_company: recipientCompany,
                    recipient_prefecture: recipientPref,
                    recipient_industry: recipientIndustry,
                    message: messageText,
                  },
                  form_url: formUrl,
                  last_status: result.status,
                  judge,
                },
              });
              queued.push(String(r.id));
            }
          } catch (err) {
            debugForThis.sentStatus = "error";

            await enqueueWaitlist(tenantId, {
              table_name: String(table),
              prospect_id: String(r.id),
              reason: "queue_form",
              payload: {
                context: {
                  recipient_company: recipientCompany,
                  recipient_prefecture: recipientPref,
                  recipient_industry: recipientIndustry,
                  message: messageText,
                },
                form_url: formUrl,
                error: String(err),
              },
            });
            queued.push(String(r.id));
          } finally {
            debugByProspect[String(r.id)] = debugForThis;
          }
        } else {
          failed.push(String(r.id));
        }
      } catch (e) {
        failed.push(String((r as any).id));
      }
    }

    // === 実行ログのステータスまとめ ===
    if (run?.id) {
      let status: string;
      if (failed.length === 0 && queued.length === 0) {
        // 全件OK
        status = "done";
      } else if (ok.length > 0 || queued.length > 0) {
        // 一部でも成功 or 待機があれば partial
        status = "partial";
      } else {
        // 全件失敗
        status = "failed";
      }

      const errParts: string[] = [];
      if (queued.length) errParts.push(`queued:${queued.length}`);
      if (failed.length) errParts.push(`failed:${failed.length}`);

      await updateRun(run.id, {
        status,
        error: errParts.length ? errParts.join(", ") : null,
        finished_at: new Date().toISOString(),
      });
    }

    const responseBody: any = { ok, queued, failed };
    // ★ フォーム送信モードのときだけ debug を返す（フロントのデバッグパネル用）
    if (channel === "form") {
      responseBody.debug = debugByProspect;
    }

    return NextResponse.json(responseBody);
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
