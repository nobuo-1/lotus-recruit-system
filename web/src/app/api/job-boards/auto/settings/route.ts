export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  JOB_BOARD_SITE_KEYS,
  SHARED_RESEARCH_TENANT_ID,
} from "@/server/job-boards/sharedResearch";

const DEFAULT_SITES = [...JOB_BOARD_SITE_KEYS];

type AutoSettings = {
  tenant_id: string;
  enabled: boolean;
  timezone: string;
  run_time: string;
  completion_emails: string[];
  notify_on_success: boolean;
  notify_on_failure: boolean;
  sites: string[];
};

function defaultSettings(tenantId: string): AutoSettings {
  return {
    tenant_id: tenantId,
    enabled: true,
    timezone: "Asia/Tokyo",
    run_time: "09:00",
    completion_emails: [],
    notify_on_success: true,
    notify_on_failure: true,
    sites: DEFAULT_SITES,
  };
}

function normalizeEmails(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).map((v) => v.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,;]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeSites(value: unknown) {
  const src = Array.isArray(value) ? value.map(String) : DEFAULT_SITES;
  const set = new Set<string>(DEFAULT_SITES);
  const out = src.filter((v) => set.has(v));
  return out.length ? out : DEFAULT_SITES;
}

export async function GET(req: Request) {
  try {
    const tenantId = SHARED_RESEARCH_TENANT_ID;

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("job_board_auto_settings")
      .select(
        "tenant_id, enabled, timezone, run_time, completion_emails, notify_on_success, notify_on_failure, sites"
      )
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({
        ok: true,
        settings: defaultSettings(tenantId),
        schedule_days: [1],
      });
    }

    return NextResponse.json({
      ok: true,
      settings: data ?? defaultSettings(tenantId),
      schedule_days: [1],
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const tenantId = SHARED_RESEARCH_TENANT_ID;

    const body = await req.json().catch(() => ({}));
    const row = {
      tenant_id: tenantId,
      enabled: Boolean(body.enabled),
      timezone:
        typeof body.timezone === "string" && body.timezone.trim()
          ? body.timezone.trim()
          : "Asia/Tokyo",
      run_time:
        typeof body.run_time === "string" && body.run_time.trim()
          ? body.run_time.trim()
          : "09:00",
      completion_emails: normalizeEmails(body.completion_emails),
      notify_on_success: body.notify_on_success !== false,
      notify_on_failure: body.notify_on_failure !== false,
      sites: normalizeSites(body.sites),
      updated_at: new Date().toISOString(),
    };

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("job_board_auto_settings")
      .upsert(row, { onConflict: "tenant_id" })
      .select(
        "tenant_id, enabled, timezone, run_time, completion_emails, notify_on_success, notify_on_failure, sites"
      )
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, settings: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
