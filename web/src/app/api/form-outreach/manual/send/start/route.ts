export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getAdmin() {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE) return createClient(SUPABASE_URL, SERVICE_ROLE);
  if (!ANON_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  }
  return createClient(SUPABASE_URL, ANON_KEY);
}

export async function POST(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const channel = body?.mode === "form" || body?.channel === "form" ? "form" : "email";
    const total = Array.isArray(body?.prospect_ids) ? body.prospect_ids.length : 0;
    if (!body?.template_id) {
      return NextResponse.json({ error: "template_id is required" }, { status: 400 });
    }
    if (total <= 0) {
      return NextResponse.json({ error: "prospect_ids is empty" }, { status: 400 });
    }

    const sb = getAdmin();
    const startedAt = new Date().toISOString();
    const progress = {
      kind: "manual-send-progress",
      channel,
      total,
      processed: 0,
      ok: 0,
      queued: 0,
      failed: 0,
      updated_at: startedAt,
    };

    const { data, error } = await sb
      .from("form_outreach_runs")
      .insert({
        tenant_id: tenantId,
        flow: `manual-send/${channel}`,
        status: "running",
        error: JSON.stringify(progress),
        started_at: startedAt,
      })
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    const runId = data?.id;
    if (!runId) throw new Error("run creation failed");

    const url = new URL("/api/form-outreach/manual/send", req.url).toString();
    const workerBody = { ...body, run_id: runId, mode: channel };

    await Promise.race([
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify(workerBody),
      }).catch(() => null),
      sleep(1200),
    ]);

    return NextResponse.json({ ok: true, run_id: runId });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
