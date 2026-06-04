export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  JOB_BOARD_PREFECTURES,
  JOB_BOARD_SITE_KEYS,
  SHARED_RESEARCH_TENANT_ID,
} from "@/server/job-boards/sharedResearch";
import type { ManualResultRow } from "@/server/job-boards/types";

const DEFAULT_SITES = [...JOB_BOARD_SITE_KEYS];

function normalizeSites(value: unknown) {
  const src = Array.isArray(value) ? value.map(String) : DEFAULT_SITES;
  const allowed = new Set<string>(DEFAULT_SITES);
  const sites = src.filter((v) => allowed.has(v));
  return sites.length ? sites : DEFAULT_SITES;
}

function formatError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

async function getAutoSites(tenantId: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("job_board_auto_settings")
    .select("sites")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return DEFAULT_SITES;
  return normalizeSites((data as { sites?: string[] } | null)?.sites);
}

async function updateRun(
  runId: string | null,
  status: string,
  note: string,
  error?: string
) {
  if (!runId) return;
  const admin = supabaseAdmin();
  await admin
    .from("job_board_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      error: error ?? null,
      note,
    })
    .eq("id", runId);
}

async function saveGraphRows(params: {
  tenantId: string;
  runId: string | null;
  rows: ManualResultRow[];
}) {
  const admin = supabaseAdmin();
  const { data: result, error: resultError } = await admin
    .from("job_board_results")
    .insert({
      tenant_id: params.tenantId,
      site: "all",
      captured_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (resultError) throw resultError;
  const resultId = result.id as string;

  const countRows = params.rows.map((row) => ({
    result_id: resultId,
    site_key: row.site_key,
    internal_large: row.internal_large,
    internal_small: row.internal_small,
    prefecture: row.prefecture,
    age_band: null,
    employment_type: null,
    salary_band: null,
    jobs_count:
      typeof row.jobs_total === "number" && Number.isFinite(row.jobs_total)
        ? row.jobs_total
        : null,
    candidates_count:
      typeof row.candidates_total === "number" &&
      Number.isFinite(row.candidates_total)
        ? row.candidates_total
        : null,
  }));

  for (let i = 0; i < countRows.length; i += 1000) {
    const chunk = countRows.slice(i, i + 1000);
    const { error } = await admin.from("job_board_counts").insert(chunk);
    if (error) throw error;
  }

  return resultId;
}

export async function POST(req: Request) {
  const startedAt = new Date().toISOString();
  let runId: string | null = null;

  try {
    const requestBody = await req.json().catch(() => ({}));
    const tenantId = SHARED_RESEARCH_TENANT_ID;

    const admin = supabaseAdmin();
    const settingsSites = await getAutoSites(tenantId);
    const sites = normalizeSites(requestBody.sites ?? settingsSites);
    const allSmall = Array.from(
      new Set(JOB_LARGE.flatMap((large) => JOB_CATEGORIES[large] ?? []))
    );
    const large =
      Array.isArray(requestBody.large) && requestBody.large.length > 0
        ? requestBody.large.map(String)
        : JOB_LARGE;
    const small =
      Array.isArray(requestBody.small) && requestBody.small.length > 0
        ? requestBody.small.map(String)
        : allSmall;
    const pref =
      Array.isArray(requestBody.pref) && requestBody.pref.length > 0
        ? requestBody.pref.map(String)
        : [...JOB_BOARD_PREFECTURES];
    const batchBody = {
      sites,
      large,
      small,
      pref,
      includeCandidates: true,
      candidateGranularity: "large",
    };

    const { data: run, error: runError } = await admin
      .from("job_board_runs")
      .insert({
        tenant_id: tenantId,
        site: "all",
        status: "running",
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (runError) throw runError;
    runId = run.id as string;

    const batchResp = await fetch(new URL("/api/job-boards/manual/run-batch", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batchBody),
      cache: "no-store",
    });
    const batch = (await batchResp.json()) as {
      ok?: boolean;
      preview?: ManualResultRow[];
      error?: string;
    };
    if (!batchResp.ok || !batch.ok || !Array.isArray(batch.preview)) {
      throw new Error(batch.error || "自動実行の取得に失敗しました。");
    }

    const resultId = await saveGraphRows({
      tenantId,
      runId,
      rows: batch.preview,
    });

    const jobsSuccessCount = batch.preview.filter(
      (row) =>
        typeof row.jobs_total === "number" && Number.isFinite(row.jobs_total)
    ).length;
    const candidatesSuccessCount = batch.preview.filter(
      (row) =>
        typeof row.candidates_total === "number" &&
        Number.isFinite(row.candidates_total)
    ).length;
    const successCount = batch.preview.filter(
      (row) =>
        typeof row.jobs_total === "number" &&
        Number.isFinite(row.jobs_total) &&
        (row.site_key === "doda" ||
          (typeof row.candidates_total === "number" &&
            Number.isFinite(row.candidates_total)))
    ).length;
    const failureCount = Math.max(0, batch.preview.length - successCount);
    const status =
      successCount === 0 ? "failed" : failureCount > 0 ? "partial" : "success";
    const note =
      status === "failed"
        ? "自動実行は失敗しました。"
        : status === "partial"
          ? `自動実行は一部失敗ありで完了しました。求人成功 ${jobsSuccessCount}/${batch.preview.length}、求職者成功 ${candidatesSuccessCount}/${batch.preview.length}`
          : `自動実行が完了しました。求人成功 ${jobsSuccessCount}/${batch.preview.length}、求職者成功 ${candidatesSuccessCount}/${batch.preview.length}`;

    await updateRun(runId, status, note, status === "failed" ? note : undefined);

    return NextResponse.json({
      ok: true,
      run_id: runId,
      result_id: resultId,
      status,
      target: {
        sites,
        large_count: large.length,
        small_count: small.length,
        prefecture_count: pref.length,
      },
      result: {
        rows: batch.preview.length,
        success_count: successCount,
        failure_count: failureCount,
        jobs_success_count: jobsSuccessCount,
        candidates_success_count: candidatesSuccessCount,
      },
    });
  } catch (e: unknown) {
    const message = formatError(e);
    await updateRun(runId, "failed", "自動実行に失敗しました。", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
