// web/src/app/api/dev/queue-health/route.ts
import { NextResponse } from "next/server";
import { emailQueue } from "@/server/queue";

export async function GET() {
  try {
    const counts = await emailQueue.getJobCounts(
      "waiting",
      "delayed",
      "active",
      "completed",
      "failed"
    );
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
