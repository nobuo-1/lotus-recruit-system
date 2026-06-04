import "../src/lib/loadEnv";

import { createClient } from "@supabase/supabase-js";
import { JOB_CATEGORIES, JOB_LARGE } from "../src/constants/jobCategories";
import {
  JOB_BOARD_PREFECTURES,
  JOB_BOARD_SITE_KEYS,
  SHARED_RESEARCH_TENANT_ID,
} from "../src/server/job-boards/sharedResearch";
import type { ManualResultRow, SiteKey } from "../src/server/job-boards/types";

type BatchResponse = {
  ok?: boolean;
  preview?: ManualResultRow[];
  error?: string;
};

type Task = {
  site: SiteKey;
  large: string;
  small: string[];
  pref: string[];
};

const args = new Set(process.argv.slice(2));
const getArg = (name: string, fallback: string) => {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const baseUrl = getArg("--base-url", process.env.JOB_BOARD_RUN_BASE_URL ?? "http://127.0.0.1:3001");
const concurrency = Number(getArg("--concurrency", "4"));
const prefChunkSize = Math.max(1, Number(getArg("--pref-chunk-size", "47")));
const dryRun = args.has("--dry-run");
const candidatesOnly = args.has("--candidates-only");
const includeCandidates = candidatesOnly || !args.has("--jobs-only");
const tenantId = SHARED_RESEARCH_TENANT_ID;

const siteArg = getArg("--sites", "");
const selectedSites = (
  siteArg
    ? siteArg.split(",").map((site) => site.trim()).filter(Boolean)
    : [...JOB_BOARD_SITE_KEYS]
).filter((site): site is SiteKey =>
  JOB_BOARD_SITE_KEYS.includes(site as (typeof JOB_BOARD_SITE_KEYS)[number])
);

if (args.has("--jobs-only") && candidatesOnly) {
  throw new Error("--jobs-only and --candidates-only cannot be used together.");
}

if (selectedSites.length === 0) {
  throw new Error("--sites did not include any valid job board site keys.");
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      const delayMs = Math.min(30000, 1000 * 2 ** (attempt - 1));
      console.warn(
        `[${new Date().toISOString()}] retry ${label} attempt=${attempt + 1}/${maxAttempts} after ${delayMs}ms: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function waitForApi() {
  const root = baseUrl.replace(/\/+$/, "");
  await withRetries(
    "local API readiness",
    async () => {
      const res = await fetch(`${root}/api/job-boards/summary/runs`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`local API returned ${res.status}`);
      }
    },
    30
  );
}

function buildTasks(): Task[] {
  const tasks: Task[] = [];
  for (const site of selectedSites) {
    for (const large of JOB_LARGE) {
      const small = JOB_CATEGORIES[large] ?? [];
      for (let i = 0; i < JOB_BOARD_PREFECTURES.length; i += prefChunkSize) {
        tasks.push({
          site,
          large,
          small,
          pref: [...JOB_BOARD_PREFECTURES].slice(i, i + prefChunkSize),
        });
      }
    }
  }
  return tasks;
}

function toCountRows(resultId: string, rows: ManualResultRow[]) {
  return rows.map((row) => ({
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
}

async function insertCountRows(
  admin: ReturnType<typeof adminClient>,
  rows: ReturnType<typeof toCountRows>
) {
  for (let i = 0; i < rows.length; i += 1000) {
    await withRetries("insert job_board_counts", async () => {
      const { error } = await admin
        .from("job_board_counts")
        .insert(rows.slice(i, i + 1000));
      if (error) throw error;
    });
  }
}

async function runBatch(task: Task): Promise<ManualResultRow[]> {
  return withRetries(`run batch ${task.site} / ${task.large}`, async () => {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/job-boards/manual/run-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sites: [task.site],
        large: [task.large],
        small: task.small,
        pref: task.pref,
        includeCandidates,
        candidateGranularity: "large",
        skipJobs: candidatesOnly,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as BatchResponse;
    if (!res.ok || !json.ok || !Array.isArray(json.preview)) {
      throw new Error(json.error || `${task.site} ${task.large} ${task.small} failed`);
    }
    return json.preview;
  });
}

async function main() {
  const tasks = buildTasks();
  const expectedRows =
    tasks.reduce((sum, task) => sum + task.small.length * task.pref.length, 0);

  console.log(
    JSON.stringify(
      {
        baseUrl,
        tenantId,
        taskCount: tasks.length,
        expectedRows,
        sites: selectedSites,
        siteCount: selectedSites.length,
        large: JOB_LARGE.length,
        taskCountAfterGrouping: tasks.length,
        prefectures: JOB_BOARD_PREFECTURES.length,
        prefChunkSize,
        concurrency,
        dryRun,
        includeCandidates,
        candidatesOnly,
      },
      null,
      2
    )
  );

  if (dryRun) return;

  await waitForApi();

  const admin = adminClient();
  const startedAt = new Date().toISOString();
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

  const runId = run.id as string;
  const { data: result, error: resultError } = await admin
    .from("job_board_results")
    .insert({
      tenant_id: tenantId,
      site: "all",
      captured_at: startedAt,
    })
    .select("id")
    .single();
  if (resultError) throw resultError;

  const resultId = result.id as string;
  console.log(`started run_id=${runId} result_id=${resultId}`);

  let cursor = 0;
  let completed = 0;
  let successRows = 0;
  let failureRows = 0;
  const errors: string[] = [];

  async function worker(workerId: number) {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) return;
      const task = tasks[index];
      try {
        const rows = await runBatch(task);
        await insertCountRows(admin, toCountRows(resultId, rows));
        const success = rows.filter((row) =>
          candidatesOnly
            ? typeof row.candidates_total === "number" &&
              Number.isFinite(row.candidates_total)
            : typeof row.jobs_total === "number" && Number.isFinite(row.jobs_total)
        ).length;
        successRows += success;
        failureRows += rows.length - success;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(`${task.site} / ${task.large} / ${task.pref.join(",")}: ${message}`);
        failureRows += task.small.length * task.pref.length;
      } finally {
        completed++;
        if (completed % 10 === 0 || completed === tasks.length) {
          console.log(
            `[${new Date().toISOString()}] worker=${workerId} completed=${completed}/${tasks.length} successRows=${successRows} failureRows=${failureRows}`
          );
        }
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.max(1, concurrency) }, (_, index) => worker(index + 1))
    );
    const status = successRows === 0 ? "failed" : failureRows > 0 ? "partial" : "success";
    await admin
      .from("job_board_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        error: errors.slice(0, 20).join("\n") || null,
      })
      .eq("id", runId);
    console.log(
      JSON.stringify(
        {
          ok: true,
          runId,
          resultId,
          status,
          completed,
          successRows,
          failureRows,
          errorCount: errors.length,
        },
        null,
        2
      )
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from("job_board_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", runId);
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
