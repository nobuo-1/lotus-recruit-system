export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

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

function sortKey(row: { started_at?: string | null; created_at?: string | null }) {
  return row.started_at || row.created_at || "";
}

export async function GET(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId)) {
      return NextResponse.json(
        { error: "x-tenant-id required (uuid)" },
        { status: 400 }
      );
    }

    const sb = getAdmin();

    const { data: manualRows, error: manualErr } = await sb
      .from("form_outreach_company_fetch_runs")
      .select(
        "id, tenant_id, status, progress, inserted, want, filters, created_at"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(300);

    if (manualErr) throw new Error(manualErr.message);

    const { data: autoRows, error: autoErr } = await sb
      .from("form_outreach_auto_runs")
      .select(
        "id, tenant_id, kind, status, started_at, finished_at, last_message, error_text, target_count, new_prospects, new_rejected, new_similar_sites"
      )
      .eq("tenant_id", tenantId)
      .eq("kind", "auto-company-list")
      .order("started_at", { ascending: false })
      .limit(300);

    if (autoErr) throw new Error(autoErr.message);

    const manualMapped = (manualRows || []).map((row: any) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      source: "manual" as const,
      flow: "manual-company-fetch",
      status: row.status || null,
      error: null,
      note: row.filters ? JSON.stringify(row.filters) : null,
      started_at: row.created_at || null,
      finished_at: null,
      created_at: row.created_at || null,
      requested_count: Number(row.want ?? 0) || 0,
      progress_count: Number(row.progress ?? 0) || 0,
      inserted_count: Number(row.inserted ?? 0) || 0,
      new_prospects: null,
      new_rejected: null,
      new_similar_sites: null,
    }));

    const autoMapped = (autoRows || []).map((row: any) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      source: "auto" as const,
      flow: row.kind || "auto-company-list",
      status: row.status || null,
      error: row.error_text || null,
      note: row.last_message || null,
      started_at: row.started_at || null,
      finished_at: row.finished_at || null,
      created_at: row.started_at || null,
      requested_count: Number(row.target_count ?? 0) || 0,
      progress_count: Number(row.new_prospects ?? 0) || 0,
      inserted_count: Number(row.new_prospects ?? 0) || 0,
      new_prospects: Number(row.new_prospects ?? 0) || 0,
      new_rejected: Number(row.new_rejected ?? 0) || 0,
      new_similar_sites: Number(row.new_similar_sites ?? 0) || 0,
    }));

    const rows = [...manualMapped, ...autoMapped].sort((a, b) => {
      const aa = sortKey(a);
      const bb = sortKey(b);
      if (!aa && !bb) return 0;
      if (!aa) return 1;
      if (!bb) return -1;
      return aa < bb ? 1 : aa > bb ? -1 : 0;
    });

    return NextResponse.json({ rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
