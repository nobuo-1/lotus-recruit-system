export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 透明1x1 GIF（メールクライアントが画像を読みに来たら「開封」として記録）
 * 例: /api/email/open?id=<delivery_id>
 */
const PIXEL_BASE64 =
  "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="; // 43B transparent GIF
const PIXEL = Buffer.from(PIXEL_BASE64, "base64");

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      // 認証不要のため service role（サーバ内）で更新
      const admin = supabaseAdmin();

      // 初回のみ開封時刻を記録（null → now）
      await admin
        .from("deliveries")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", id)
        .is("opened_at", null);
    }
  } catch {
    // 失敗してもピクセルは返す（ユーザ体験優先）
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, private, max-age=0",
    },
  });
}
