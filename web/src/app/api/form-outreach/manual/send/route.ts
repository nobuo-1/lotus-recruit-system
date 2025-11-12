// web/src/app/api/form-outreach/manual/send/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendMail } from "@/server/mailer"; // ← 既存 mailer をそのまま使用

type TableName =
  | "form_prospects"
  | "form_prospects_rejected"
  | "form_similar_sites";

function resolveTable(v: string | null | undefined): TableName {
  const s = (v || "").toLowerCase().trim();
  if (s === "form_prospects_rejected" || s === "rejected")
    return "form_prospects_rejected";
  if (s === "form_similar_sites" || s === "similar")
    return "form_similar_sites";
  return "form_prospects";
}

function pickCompanyName(row: any) {
  return (
    row.company_name || row.target_company_name || row.found_company_name || "-"
  );
}
function pickWebsite(row: any) {
  return row.website || row.found_website || "";
}
function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ""));
}

function renderTemplate(
  raw: string,
  ctx: {
    sender_company?: string;
    sender_name?: string;
    recipient_company?: string;
    website?: string;
    today?: string;
  },
  unknownPlaceholder: string
) {
  const dict: Record<string, string> = {
    "{{sender_company}}": ctx.sender_company || unknownPlaceholder,
    "{{sender_name}}": ctx.sender_name || unknownPlaceholder,
    "{{recipient_company}}": ctx.recipient_company || unknownPlaceholder,
    "{{website}}": ctx.website || unknownPlaceholder,
    "{{today}}": ctx.today || new Date().toISOString().slice(0, 10),
  };
  let t = String(raw || "");
  for (const k of Object.keys(dict)) t = t.split(k).join(dict[k]);
  return t;
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const table = resolveTable(body?.table);
    const templateId = String(body?.template_id || "");
    const ids: string[] = Array.isArray(body?.prospect_ids)
      ? body.prospect_ids
      : [];
    const unknownPlaceholder = String(
      body?.unknown_placeholder || "メッセージをご確認ください"
    );

    if (!templateId || ids.length === 0) {
      return NextResponse.json(
        { error: "template_id and prospect_ids are required" },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();

    // テンプレ取得（channel='template'）
    const { data: tpl, error: tplErr } = await sb
      .from("form_outreach_messages")
      .select("id, tenant_id, name, subject, body_text, channel")
      .eq("id", templateId)
      .eq("tenant_id", tenantId)
      .eq("channel", "template")
      .single();

    if (tplErr || !tpl) {
      return NextResponse.json(
        { error: tplErr?.message || "template not found" },
        { status: 404 }
      );
    }

    // 対象レコード
    const { data: rows, error: rowsErr } = await sb
      .from(table)
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", ids);

    if (rowsErr) {
      return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    }

    const ok: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    const queued: { id: string; reason: string }[] = [];

    // テンプレのチャネル希望
    const tplChannel = (tpl.channel || "").toLowerCase();
    const wantsEmail =
      tplChannel === "email" || tplChannel === "both" || !tplChannel;
    const wantsForm =
      tplChannel === "form" || tplChannel === "both" || !tplChannel;

    for (const row of rows || []) {
      const company = pickCompanyName(row);
      const website = pickWebsite(row);
      const to = String(row?.contact_email || "").trim();
      const formUrl = String(row?.contact_form_url || "").trim();

      let doEmail = false;
      let doForm = false;

      if (wantsEmail && to) doEmail = true;
      else if (wantsForm && formUrl) doForm = true;

      if (!doEmail && !doForm) {
        failed.push({
          id: row.id,
          reason:
            !to && !formUrl
              ? "no_contact"
              : wantsEmail
              ? "no_email"
              : "no_form",
        });
        continue;
      }

      // メール（既存 mailer.ts を直呼び）
      if (doEmail) {
        if (!isValidEmail(to)) {
          failed.push({ id: row.id, reason: "invalid_email" });
        } else {
          try {
            const subject = renderTemplate(
              tpl.subject || "",
              { recipient_company: company, website },
              unknownPlaceholder
            );
            const text = renderTemplate(
              tpl.body_text || "",
              { recipient_company: company, website },
              unknownPlaceholder
            );
            const html =
              "<div style='white-space:pre-wrap;line-height:1.7'>" +
              text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/\n/g, "<br/>") +
              "</div>";

            await sendMail({
              to,
              subject: subject || "(件名なし)",
              html,
              text,
            }); // ← 既存の型にそのまま一致

            ok.push(row.id);
          } catch (e: any) {
            failed.push({ id: row.id, reason: "email_error" });
          }
        }
        continue; // メールを優先（both の場合も）
      }

      // フォーム：待機リストに投入（reCAPTCHA 等は後段ワーカーで処理）
      const payload = {
        tenant_id: tenantId,
        table_name: table,
        prospect_id: row.id,
        form_url: formUrl,
        template_id: tpl.id,
        context: {
          recipient_company: company,
          website,
          unknown_placeholder: unknownPlaceholder,
        },
        reason: "queue_form",
      };

      const { error: wErr } = await sb.from("form_outreach_waitlist").insert([
        {
          tenant_id: tenantId,
          table_name: table,
          prospect_id: row.id,
          reason: "queue_form",
          payload,
        },
      ]);

      if (wErr) {
        failed.push({ id: row.id, reason: "waitlist_insert_failed" });
      } else {
        queued.push({ id: row.id, reason: "queued_form" });
      }
    }

    return NextResponse.json({ ok, queued, failed });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
