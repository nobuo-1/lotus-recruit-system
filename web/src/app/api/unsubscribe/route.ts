import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new NextResponse("invalid request", { status: 400 });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: () => undefined, set: () => {}, remove: () => {} } }
  );

  const { error } = await supabase
    .from("recipients")
    .update({ consent: "opt_out", unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token);

  const ok = !error;
  const html = `<!doctype html><html><body style="font-family:sans-serif;padding:24px">
  <h1>配信停止${ok ? "完了" : "エラー"}</h1>
  <p>${
    ok
      ? "今後、このアドレスへの配信は停止されます。"
      : "リンクが無効か、既に停止済みです。"
  }</p>
  </body></html>`;
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: ok ? 200 : 400,
  });
}
