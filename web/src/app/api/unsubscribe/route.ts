// web/src/app/api/unsubscribe/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * メール本文の「配信停止」リンクから到達。
 * - recipients.consent を 'opt_out'
 * - recipients.is_active を false
 * - recipients.unsubscribed_at を now
 * をサービスロールで確実に更新（RLSの影響を受けない）
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new NextResponse("invalid request", { status: 400 });

  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("recipients")
    .update({
      consent: "opt_out",
      is_active: false,
      unsubscribed_at: new Date().toISOString(),
    })
    .eq("unsubscribe_token", token)
    .select("id")
    .maybeSingle();

  const ok = !error && !!data;

  const html = `<!doctype html>
<html>
  <body style="font-family:sans-serif;padding:24px">
    <h1>配信停止${ok ? "完了" : "エラー"}</h1>
    <p>${
      ok
        ? "今後、このアドレスへの配信は停止されます。"
        : "リンクが無効か、既に停止済みです。"
    }</p>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: ok ? 200 : 400,
  });
}
