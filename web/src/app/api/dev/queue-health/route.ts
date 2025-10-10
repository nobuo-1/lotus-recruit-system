// web/src/app/api/dev/queue-health/route.ts
import { NextResponse } from "next/server";
import { emailQueue } from "@/server/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const counts = await emailQueue.getJobCounts();
  return NextResponse.json({ ok: true, counts });
}
