// web/src/app/api/form-outreach/waitlist/retry/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendMail } from "@/server/mailer";

function replacer(t: string, dict: Record<string, string>) {
  let out = t || "";
  for (const k of Object.keys(dict)) out = out.split(k).join(dict[k]);
  return out;
}

// 超簡易フォーム送信（できる範囲でトライ。reCAPTCHA等は waiting に戻す）
async function trySubmitForm(
  formUrl: string,
  payload: any
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(formUrl, { method: "GET" });
    const html = await res.text();
    if (/recaptcha|grecaptcha|hcaptcha/i.test(html)) {
      return { ok: false, error: "recaptcha_detected" };
    }
    // よくある name のみ対応（超簡易）
    const fd = new URLSearchParams();
    const ctx = payload?.context || {};
    fd.set(
      "company",
      ctx.sender_company || ctx.recipient_company || "株式会社LOTUS"
    );
    fd.set("name", ctx.sender_name || "担当者");
    fd.set(
      "email",
      payload?.fromEmail || payload?.contact_email || "no-reply@example.com"
    );
    fd.set("subject", payload?.subject || "お問い合わせ");
    fd.set(
      "message",
      payload?.message || payload?.body_text || "メッセージをご確認ください"
    );
    const postTo = formUrl;
    const pr = await fetch(postTo, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: fd.toString(),
    });
    const ok = pr.status >= 200 && pr.status < 400;
    if (!ok) return { ok: false, error: `status_${pr.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId)
      return NextResponse.json(
        { error: "x-tenant-id required" },
        { status: 400 }
      );

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (!ids.length)
      return NextResponse.json({ error: "ids required" }, { status: 400 });

    const sb = await supabaseServer();
    const { data: rows, error } = await sb
      .from("form_outreach_waitlist")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const ok: string[] = [];
    const waiting: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const w of rows || []) {
      const payload = w.payload || {};
      const mode =
        payload?.mode || (w.reason?.includes("form") ? "form" : "email");

      if (mode === "email") {
        try {
          const to = payload?.to || payload?.contact_email;
          const subject = payload?.subject || "ご連絡";
          let html = payload?.html || payload?.body_html || "";
          const text = payload?.text || payload?.body_text || "";
          if (!to) {
            failed.push({ id: w.id, error: "no_email" });
            await sb
              .from("form_outreach_waitlist")
              .update({
                tries: (w.tries ?? 0) + 1,
                status: "failed",
                last_error: "no_email",
              })
              .eq("id", w.id);
            continue;
          }
          // 送信
          await sendMail({
            to,
            subject,
            html,
            text,
            brandCompany: payload?.brandCompany,
            brandAddress: payload?.brandAddress,
            brandSupport: payload?.brandSupport,
          });
          ok.push(w.id);
          await sb
            .from("form_outreach_waitlist")
            .update({
              status: "done",
              tries: (w.tries ?? 0) + 1,
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", w.id);
        } catch (e: any) {
          const msg = String(e?.message || e);
          failed.push({ id: w.id, error: msg });
          await sb
            .from("form_outreach_waitlist")
            .update({
              tries: (w.tries ?? 0) + 1,
              status: "failed",
              last_error: msg,
            })
            .eq("id", w.id);
        }
      } else {
        // form
        const formUrl = payload?.form_url || payload?.contact_form_url;
        if (!formUrl) {
          failed.push({ id: w.id, error: "no_form_url" });
          await sb
            .from("form_outreach_waitlist")
            .update({
              tries: (w.tries ?? 0) + 1,
              status: "failed",
              last_error: "no_form_url",
            })
            .eq("id", w.id);
          continue;
        }
        const res = await trySubmitForm(formUrl, payload);
        if (res.ok) {
          ok.push(w.id);
          await sb
            .from("form_outreach_waitlist")
            .update({
              status: "done",
              tries: (w.tries ?? 0) + 1,
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", w.id);
        } else if (res.error === "recaptcha_detected") {
          waiting.push(w.id);
          await sb
            .from("form_outreach_waitlist")
            .update({
              tries: (w.tries ?? 0) + 1,
              status: "waiting",
              last_error: "recaptcha_detected",
            })
            .eq("id", w.id);
        } else {
          failed.push({ id: w.id, error: res.error || "unknown" });
          await sb
            .from("form_outreach_waitlist")
            .update({
              tries: (w.tries ?? 0) + 1,
              status: "failed",
              last_error: res.error || "unknown",
            })
            .eq("id", w.id);
        }
      }
    }

    return NextResponse.json({ ok, waiting, failed });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
