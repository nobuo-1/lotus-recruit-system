import { NextResponse } from "next/server";
import { emailQueue } from "@/server/queue";

export const dynamic = "force-dynamic";

function assertDevToken(req: Request) {
  const want = process.env.DEV_ADMIN_TOKEN;
  if (!want) return true; // トークン未設定なら無認可でも通す（手元検証向け）
  const got =
    req.headers.get("x-dev-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return got && got === want;
}

/** キューに “noop” を1件だけ投入（メール送信はしない） */
export async function POST(req: Request) {
  if (!assertDevToken(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const jobId = `noop:${Date.now()}`;
  await emailQueue.add("noop", { kind: "noop", note: "health-check" } as any, {
    jobId,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
  return NextResponse.json({ ok: true, jobId });
}
