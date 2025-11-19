// web/src/app/api/form-outreach/automation/cron/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";

const CRON_SECRET = process.env.FORM_OUTREACH_CRON_SECRET || "";

function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const tenantId =
      url.searchParams.get("tenant_id") ||
      url.searchParams.get("tenantId") ||
      "";

    if (!CRON_SECRET) {
      return NextResponse.json(
        { error: "FORM_OUTREACH_CRON_SECRET is not set" },
        { status: 500 }
      );
    }
    if (!tenantId || !okUuid(tenantId)) {
      return NextResponse.json(
        { error: "tenant_id (uuid) is required" },
        { status: 400 }
      );
    }
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }

    const base =
      process.env.APP_URL ||
      `${url.protocol}//${url.host}` ||
      "http://localhost:3000";

    // 既存の run-company-list を叩いて「自動リスト取得」を実行
    const res = await fetch(
      `${base}/api/form-outreach/automation/run-company-list`,
      {
        method: "POST",
        headers: {
          "x-tenant-id": tenantId,
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "cron" }),
      }
    );

    const body = await res.json().catch(() => ({}));

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        body,
      },
      { status: res.ok ? 200 : res.status }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
