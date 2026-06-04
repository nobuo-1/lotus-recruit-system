export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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

function parseProgress(errorText: string | null) {
  if (!errorText) return null;
  try {
    const parsed = JSON.parse(errorText);
    if (parsed?.kind === "manual-send-progress") return parsed;
  } catch {
    return null;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    const runId = new URL(req.url).searchParams.get("run_id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }
    if (!runId) {
      return NextResponse.json({ error: "run_id required" }, { status: 400 });
    }

    const sb = getAdmin();
    const { data, error } = await sb
      .from("form_outreach_runs")
      .select("id, tenant_id, flow, status, error, started_at, finished_at")
      .eq("tenant_id", tenantId)
      .eq("id", runId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "run not found" }, { status: 404 });

    return NextResponse.json({
      run: data,
      progress: parseProgress((data as any).error || null),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
