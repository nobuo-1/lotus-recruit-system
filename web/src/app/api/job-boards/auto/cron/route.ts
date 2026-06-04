export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";

function jstDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return {
    year: get("year") ?? "",
    month: get("month") ?? "",
    day: Number(get("day") ?? "0"),
  };
}

async function handleCron(req: Request) {
  const token = req.headers.get("x-cron-token");
  const expected = process.env.JOB_BOARD_AUTO_TOKEN;
  if (expected && token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parts = jstDateParts();
  if (parts.day !== 1) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      date: `${parts.year}-${parts.month}-${String(parts.day).padStart(2, "0")}`,
    });
  }

  const res = await fetch(new URL("/api/job-boards/auto/run-now", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": req.headers.get("x-tenant-id") ?? "",
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}
