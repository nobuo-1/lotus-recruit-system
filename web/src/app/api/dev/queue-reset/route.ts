// web/src/app/api/dev/queue-reset/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { emailQueue } from "@/server/queue";

function isAuthed(req: Request) {
  const want = process.env.DEV_ADMIN_TOKEN;
  if (!want) return true; // トークン未設定なら通す（検証用）。本番は false にすることを推奨
  const h = req.headers.get("x-dev-token") || req.headers.get("authorization");
  if (!h) return false;
  const token = h.startsWith("Bearer ") ? h.slice(7) : h;
  return token === want;
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 直近状態
  const before = await emailQueue.getJobCounts();

  // BullMQ の clean(graceMs, limit, type)
  const graceMs = 0; // 0ms 経過で即対象
  const limit = 10000; // 一度に掃除する最大件数（必要なら増減）
  await emailQueue.clean(graceMs, limit, "failed");
  await emailQueue.clean(graceMs, limit, "completed");

  // お好みで他タイプも掃除したい場合は以下
  // await emailQueue.clean(graceMs, limit, "delayed");
  // await emailQueue.clean(graceMs, limit, "wait"); // 'waiting' ではなく 'wait'

  const after = await emailQueue.getJobCounts();

  return NextResponse.json({ ok: true, before, after });
}

// 誤操作防止に GET は 405 を返す
export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
