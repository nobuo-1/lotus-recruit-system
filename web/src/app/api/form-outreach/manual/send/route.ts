// web/src/app/api/form-outreach/manual/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendMail } from "@/server/mailer";

type Mode = "email" | "form";

function compile(t: string, dict: Record<string, string>) {
  let out = t || "";
  for (const k of Object.keys(dict)) out = out.split(k).join(dict[k]);
  return out;
}

async function trySubmitForm(
  formUrl: string,
  message: string,
  context: any
): Promise<{ ok: boolean; error?: string }> {
  try {
    // 1st: 画面を事前取得（reCAPTCHA等の検知）
    const res = await fetch(formUrl, { method: "GET" });
    const html = await res.text();
    if (/recaptcha|grecaptcha|hcaptcha/i.test(html)) {
      return { ok: false, error: "recaptcha_detected" };
    }

    // 2nd: よくあるフィールド名で POST（簡易）
    const fd = new URLSearchParams();
    fd.set(
      "company",
      context?.sender_company || context?.recipient_company || "株式会社LOTUS"
    );
    fd.set("name", context?.sender_name || "担当者");
    fd.set("email", context?.sender_email || "no-reply@example.com");
    fd.set("subject", context?.subject || "お問い合わせ");
    fd.set("message", message || "メッセージをご確認ください");

    const pr = await fetch(formUrl, {
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
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const mode: Mode = body?.mode === "form" ? "form" : "email";
    const table: string = String(body?.table || "");
    const templateId: string = String(body?.template_id || "");
    const ids: string[] = Array.isArray(body?.prospect_ids)
      ? body.prospect_ids
      : [];
    const unknownPlaceholder: string = String(
      body?.unknown_placeholder || "メッセージをご確認ください"
    );

    if (!table || !templateId || !ids.length) {
      return NextResponse.json(
        { error: "table, template_id, prospect_ids are required" },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();

    // テンプレ取得
    const { data: tpl, error: tplErr } = await sb
      .from("form_outreach_messages")
      .select("id, name, subject, body_text")
      .eq("id", templateId)
      .maybeSingle();
    if (tplErr || !tpl) {
      return NextResponse.json(
        { error: tplErr?.message || "template not found" },
        { status: 404 }
      );
    }

    // 対象行を取得
    const { data: prospects, error: pErr } = await sb
      .from(table)
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", ids);

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const ok: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    const queued: string[] = [];

    const today = new Date().toISOString().slice(0, 10);

    for (const row of prospects || []) {
      const ctx = {
        sender_company: "株式会社LOTUS",
        sender_name: "担当者",
        recipient_company:
          (row as any).company_name ||
          (row as any).target_company_name ||
          (row as any).found_company_name ||
          "-",
        website: (row as any).website || (row as any).found_website || "",
        today,
      };

      const subject =
        compile(tpl.subject || "", {
          "{{sender_company}}": ctx.sender_company,
          "{{sender_name}}": ctx.sender_name,
          "{{recipient_company}}": ctx.recipient_company,
          "{{website}}": ctx.website,
          "{{today}}": ctx.today,
        }) || "ご連絡";

      const bodyText =
        compile(tpl.body_text || "", {
          "{{sender_company}}": ctx.sender_company,
          "{{sender_name}}": ctx.sender_name,
          "{{recipient_company}}": ctx.recipient_company,
          "{{website}}": ctx.website,
          "{{today}}": ctx.today,
        }) || unknownPlaceholder;

      if (mode === "email") {
        const to = String((row as any).contact_email || "").trim();
        if (!to) {
          // メールアドレス無し → 待機へ
          queued.push((row as any).id);
          await sb.from("form_outreach_waitlist").insert({
            tenant_id: tenantId,
            table_name: table,
            prospect_id: (row as any).id,
            reason: "no_email",
            status: "waiting",
            payload: {
              mode: "email",
              contact_email: null,
              subject,
              body_text: bodyText,
              context: ctx,
            },
          });
          continue;
        }
        try {
          await sendMail({
            to,
            subject,
            html: bodyText,
            text: bodyText,
          });
          ok.push((row as any).id);
        } catch (e: any) {
          const msg = String(e?.message || e);
          failed.push({ id: (row as any).id, error: msg });
          await sb.from("form_outreach_waitlist").insert({
            tenant_id: tenantId,
            table_name: table,
            prospect_id: (row as any).id,
            reason: "error",
            status: "waiting",
            payload: {
              mode: "email",
              contact_email: to,
              subject,
              body_text: bodyText,
              context: ctx,
              last_error: msg,
            },
          });
        }
      } else {
        // フォーム送信
        const formUrl = String((row as any).contact_form_url || "").trim();
        if (!formUrl) {
          queued.push((row as any).id);
          await sb.from("form_outreach_waitlist").insert({
            tenant_id: tenantId,
            table_name: table,
            prospect_id: (row as any).id,
            reason: "queue_form",
            status: "waiting",
            payload: {
              mode: "form",
              form_url: null,
              body_text: bodyText,
              context: ctx,
            },
          });
          continue;
        }
        const res = await trySubmitForm(formUrl, bodyText, {
          ...ctx,
          subject,
        });
        if (res.ok) {
          ok.push((row as any).id);
        } else if (res.error === "recaptcha_detected") {
          queued.push((row as any).id);
          await sb.from("form_outreach_waitlist").insert({
            tenant_id: tenantId,
            table_name: table,
            prospect_id: (row as any).id,
            reason: "recaptcha",
            status: "waiting",
            payload: {
              mode: "form",
              form_url: formUrl,
              body_text: bodyText,
              context: ctx,
              last_error: res.error,
            },
          });
        } else {
          failed.push({ id: (row as any).id, error: res.error || "unknown" });
          await sb.from("form_outreach_waitlist").insert({
            tenant_id: tenantId,
            table_name: table,
            prospect_id: (row as any).id,
            reason: "error",
            status: "waiting",
            payload: {
              mode: "form",
              form_url: formUrl,
              body_text: bodyText,
              context: ctx,
              last_error: res.error || "unknown",
            },
          });
        }
      }
    }

    // 実行ログ（拡張カラムに合わせて保存）
    try {
      await sb.from("form_outreach_runs").insert({
        tenant_id: tenantId,
        flow: mode === "email" ? "manual-send-email" : "manual-send-form",
        status: failed.length
          ? ok.length
            ? "partial"
            : "failed"
          : "succeeded",
        error: failed.length ? `${failed.length} failed` : null,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        mode,
        table_name: table,
        template_id: templateId,
        ok_count: ok.length,
        queued_count: queued.length,
        failed_count: failed.length,
        meta: { ok, queued, failed },
      });
    } catch {
      // ログの失敗は致命的ではないので握りつぶし
    }

    return NextResponse.json({ ok, queued, failed });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
