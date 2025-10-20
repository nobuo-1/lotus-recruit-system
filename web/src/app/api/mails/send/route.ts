// web/src/app/api/mails/send/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 任意: 動作確認用（不要なら削除可） */
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/mails/send" });
}

/** Row 型定義 */
type MailRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  subject: string | null;
  body_text: string | null;
};

type RecipientRow = {
  id: string;
  email: string | null;
  name: string | null;
  consent: string | null;
};

function supabaseAdmin(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE envs (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } }) as any;
}

function makeTransport() {
  const host = process.env.SMTP_HOST!;
  const port = +(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function resolveFromEmail(
  supabase: any,
  tenantId: string | null | undefined
) {
  if (tenantId) {
    try {
      const { data } = await supabase
        .from("email_settings")
        .select("from_email")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const v = String(data?.from_email ?? "").trim();
      if (v) return v;
    } catch {}
  }
  const envFrom = String(
    process.env.SMTP_FROM ?? process.env.SMTP_USER ?? ""
  ).trim();
  if (envFrom) return envFrom;
  throw new Error(
    "差出人メールが見つかりません（email_settings.from_email または SMTP_FROM/SMTP_USER を設定してください）"
  );
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();
    const mailId: string = String(body.mailId || "");
    const ids: string[] = (body.recipientIds ?? []) as string[];
    const scheduleAt = body.scheduleAt ? new Date(body.scheduleAt) : null;

    if (!mailId || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    // mails は body_text のみ参照（body_html は使わない）
    const { data: mailRaw, error: me } = await supabase
      .from("mails")
      .select("id, tenant_id, name, subject, body_text")
      .eq("id", mailId)
      .maybeSingle();

    const mail = (mailRaw as MailRow | null) ?? null;
    if (me || !mail) {
      return NextResponse.json(
        { error: me?.message ?? "mail not found" },
        { status: 404 }
      );
    }

    const fromEmail = await resolveFromEmail(supabase, mail.tenant_id);

    // 予約：schedules + deliveries(scheduled)
    if (scheduleAt) {
      const { error: se } = await supabase.from("mail_schedules").insert({
        mail_id: mailId,
        scheduled_at: scheduleAt.toISOString(),
        status: "scheduled",
      });
      if (se) return NextResponse.json({ error: se.message }, { status: 500 });

      const ins = ids.map((rid: string) => ({
        mail_id: mailId,
        recipient_id: rid,
        status: "scheduled",
        sent_at: null,
      }));
      const { error: de } = await supabase.from("mail_deliveries").insert(ins);
      if (de) return NextResponse.json({ error: de.message }, { status: 500 });

      // （存在すれば）mails.status を queued に（失敗しても無視）
      try {
        await supabase
          .from("mails")
          .update({ status: "queued" })
          .eq("id", mailId);
      } catch {}
      return NextResponse.json({ ok: true, scheduled: ids.length });
    }

    // 即時送信：先に queued を作成 → 成功で sent / 失敗で error に更新
    const { data: recsRaw, error: re } = await supabase
      .from("recipients")
      .select("id, email, name, consent")
      .in("id", ids);

    if (re) return NextResponse.json({ error: re.message }, { status: 500 });

    const recipients = (recsRaw as RecipientRow[] | null) ?? [];
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "no recipients found" },
        { status: 400 }
      );
    }

    // 先に queued を作成（meta列は使わない）
    const queuedRows = recipients.map((r) => ({
      mail_id: mailId,
      recipient_id: r.id,
      status: "queued",
      sent_at: null,
    }));
    {
      const { error: qe } = await supabase
        .from("mail_deliveries")
        .insert(queuedRows);
      if (qe) return NextResponse.json({ error: qe.message }, { status: 500 });
      try {
        await supabase
          .from("mails")
          .update({ status: "queued" })
          .eq("id", mailId);
      } catch {}
    }

    const transporter = makeTransport();
    const subjectTpl = String(mail.subject ?? "");
    const bodyTextRaw = String(mail.body_text ?? "");

    let sent = 0;
    const results: { id: string; ok: boolean; message?: string }[] = [];

    for (const r of recipients) {
      try {
        if (!r.email) {
          results.push({ id: r.id, ok: false, message: "no email" });
          await supabase
            .from("mail_deliveries")
            .update({
              status: "error",
              sent_at: new Date().toISOString(),
            })
            .match({ mail_id: mailId, recipient_id: r.id, status: "queued" });
          continue;
        }
        if (r.consent === "opt_out") {
          results.push({ id: r.id, ok: false, message: "opt-out" });
          await supabase
            .from("mail_deliveries")
            .update({
              status: "error",
              sent_at: new Date().toISOString(),
            })
            .match({ mail_id: mailId, recipient_id: r.id, status: "queued" });
          continue;
        }

        const subject = subjectTpl
          .replaceAll("{{NAME}}", String(r.name ?? ""))
          .replaceAll("{{EMAIL}}", String(r.email));
        const text = bodyTextRaw
          .replaceAll("{{NAME}}", String(r.name ?? ""))
          .replaceAll("{{EMAIL}}", String(r.email));

        await transporter.sendMail({
          from: fromEmail,
          to: r.email,
          subject,
          text,
        });

        await supabase
          .from("mail_deliveries")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .match({ mail_id: mailId, recipient_id: r.id, status: "queued" });

        results.push({ id: r.id, ok: true });
        sent++;
      } catch (e: any) {
        await supabase
          .from("mail_deliveries")
          .update({
            status: "error",
            sent_at: new Date().toISOString(),
          })
          .match({ mail_id: mailId, recipient_id: r.id, status: "queued" });

        results.push({ id: r.id, ok: false, message: String(e?.message || e) });
      }
    }

    return NextResponse.json({ ok: true, sent, results });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
