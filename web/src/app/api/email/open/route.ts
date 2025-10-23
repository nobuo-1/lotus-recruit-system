// web/src/app/api/email/open/route.ts
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 透明1x1 GIF（メールクライアントが画像を読みに来たら「開封」を記録）
 * 例:
 *   キャンペーン … /api/email/open?id=<deliveries.id>
 *   プレーン     … /api/email/open?id=<mail_deliveries.id>&type=mail
 */
const PIXEL_BASE64 =
  "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="; // 43B transparent GIF
const PIXEL = Buffer.from(PIXEL_BASE64, "base64");

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const type = (url.searchParams.get("type") || "").toLowerCase();

    if (id) {
      const admin = supabaseAdmin();

      if (type === "mail") {
        // プレーンメールの開封（mail_deliveries）
        await admin
          .from("mail_deliveries")
          .update({ opened_at: new Date().toISOString() })
          .eq("id", id)
          .is("opened_at", null);
      } else {
        // キャンペーンの開封（deliveries）
        await admin
          .from("deliveries")
          .update({ opened_at: new Date().toISOString() })
          .eq("id", id)
          .is("opened_at", null);
      }
    }
  } catch {
    // 失敗してもピクセルは返す
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, private, max-age=0",
    },
  });
}
