// web/src/app/api/email/open/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 透明1x1 GIF（メールクライアントが画像を読みに来たら「開封」として記録）
 * 例:
 *   - キャンペーン（既存）: /api/email/open?id=<deliveries.id>
 *   - プレーンメール       : /api/email/open?t=mail&id=<mail_deliveries.id>
 */
const PIXEL_BASE64 =
  "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="; // 43B transparent GIF
const PIXEL = Buffer.from(PIXEL_BASE64, "base64");

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const t = (url.searchParams.get("t") || "").toLowerCase(); // "mail" or ""

    if (id) {
      // 認証不要のため service role（サーバ内）で更新
      const admin = supabaseAdmin();

      if (t === "mail") {
        // プレーンメール: mail_deliveries 側の opened_at を初回のみ記録
        await admin
          .from("mail_deliveries")
          .update({ opened_at: new Date().toISOString() })
          .eq("id", id)
          .is("opened_at", null);
      } else {
        // 既存（キャンペーン）: deliveries 側の opened_at を初回のみ記録
        await admin
          .from("deliveries")
          .update({ opened_at: new Date().toISOString() })
          .eq("id", id)
          .is("opened_at", null);
      }
    }
  } catch {
    // 失敗してもピクセルは返す（ユーザ体験優先）
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, private, max-age=0",
      "content-length": String(PIXEL.length),
    },
  });
}
