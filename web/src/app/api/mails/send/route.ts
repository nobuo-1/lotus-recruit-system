import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// --- Supabase Admin Client ---
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE envs (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// --- SMTP Transport ---
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

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function GET() {
  return NextResponse.json({ ok: true, path: "/api/mails/send" });
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();
    const mailId = String(body.mailId || "");
    const ids = (body.recipientIds ?? []) as string[];
    const scheduleAt = body.scheduleAt ? new Date(body.scheduleAt) : null;

    if (!mailId || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    // メール本体
    const { data: mail, error: me } = await supabase
      .from("mails")
      .select("id, tenant_id, name, subject, from_email, body_text, body_html")
      .eq("id", mailId)
      .maybeSingle();

    if (me || !mail) {
      return NextResponse.json(
        { error: me?.message ?? "mail not found" },
        { status: 404 }
      );
    }

    // 予約
    if (scheduleAt) {
      const { error: se } = await supabase.from("mail_schedules").insert({
        mail_id: mailId,
        scheduled_at: scheduleAt.toISOString(),
        status: "scheduled",
        tenant_id: mail.tenant_id,
      });
      if (se) return NextResponse.json({ error: se.message }, { status: 500 });

      const ins = ids.map((rid: string) => ({
        mail_id: mailId,
        recipient_id: rid,
        status: "scheduled",
        sent_at: null,
        meta: null,
      }));
      const { error: de } = await supabase.from("mail_deliveries").insert(ins);
      if (de) return NextResponse.json({ error: de.message }, { status: 500 });

      return NextResponse.json({ ok: true, scheduled: ids.length });
    }

    // 即時送信
    const { data: recs, error: re } = await supabase
      .from("recipients")
      .select("id, email, name, consent")
      .in("id", ids);

    if (re) return NextResponse.json({ error: re.message }, { status: 500 });

    const transporter = makeTransport();
    const subjectTpl = String(mail.subject ?? "");
    const bodyTextRaw =
      String(mail.body_text ?? "") || htmlToText(String(mail.body_html ?? ""));
    const fromEmail = String(mail.from_email ?? "");

    const results: { id: string; ok: boolean; message?: string }[] = [];

    for (const r of recs ?? []) {
      try {
        if (!r.email) {
          results.push({ id: r.id, ok: false, message: "no email" });
          continue;
        }
        if (r.consent === "opt_out") {
          results.push({ id: r.id, ok: false, message: "opt-out" });
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

        await supabase.from("mail_deliveries").insert({
          mail_id: mailId,
          recipient_id: r.id,
          status: "sent",
          sent_at: new Date().toISOString(),
          meta: null,
        });

        results.push({ id: r.id, ok: true });
      } catch (e: any) {
        await supabase.from("mail_deliveries").insert({
          mail_id: mailId,
          recipient_id: r.id,
          status: "error",
          sent_at: new Date().toISOString(),
          meta: { error: String(e?.message || e) },
        });
        results.push({ id: r.id, ok: false, message: String(e?.message || e) });
      }
    }

    const okCount = results.filter((x) => x.ok).length;
    return NextResponse.json({ ok: true, sent: okCount, results });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
