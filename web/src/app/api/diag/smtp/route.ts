// web/src/app/api/diag/smtp/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function GET() {
  try {
    const host = process.env.SMTP_HOST!;
    const port = Number(process.env.SMTP_PORT!);
    const user = process.env.SMTP_USER!;
    const pass = process.env.SMTP_PASS!;
    const from = process.env.FROM_EMAIL!;
    const to = process.env.DIAG_TO || from;

    const t = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await t.verify(); // 認証/接続テスト

    const info = await t.sendMail({
      from,
      to,
      subject: "SMTP diag",
      text: "ok",
    });

    return NextResponse.json({ ok: true, messageId: info?.messageId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
