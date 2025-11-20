// web/src/app/api/job-boards/manual/run-batch/route.ts

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  ManualCondition,
  ManualFetchRow,
  SiteKey,
} from "@/server/job-boards/types";
import { fetchMynaviJobsCount } from "@/server/job-boards/mynavi";
import { fetchDodaJobsCount } from "@/server/job-boards/doda";

type RequestBody = {
  sites?: string[];
  large?: string[];
  small?: string[];
  age?: string[];
  emp?: string[];
  sal?: string[];
  pref?: string[];
  want?: number;
  saveMode?: string;
};

/**
 * /job-boards/manual の画面から送られてきた配列を
 * 「1行分の条件（ManualCondition）」のリストに変換する。
 *
 * want 件を上限として全組み合わせを切り出す。
 */
function buildConditions(
  sites: SiteKey[],
  body: RequestBody
): ManualCondition[] {
  const largeList = body.large && body.large.length > 0 ? body.large : [null];
  const smallList = body.small && body.small.length > 0 ? body.small : [null];
  const ageList = body.age && body.age.length > 0 ? body.age : [null];
  const empList = body.emp && body.emp.length > 0 ? body.emp : [null];
  const salList = body.sal && body.sal.length > 0 ? body.sal : [null];
  const prefList = body.pref && body.pref.length > 0 ? body.pref : [null];

  const max = typeof body.want === "number" && body.want > 0 ? body.want : 200;

  const out: ManualCondition[] = [];

  for (const siteKey of sites) {
    for (const L of largeList) {
      for (const S of smallList) {
        for (const A of ageList) {
          for (const E of empList) {
            for (const Sa of salList) {
              for (const P of prefList) {
                out.push({
                  siteKey,
                  internalLarge: L,
                  internalSmall: S,
                  ageBand: A,
                  employmentType: E,
                  salaryBand: Sa,
                  prefecture: P,
                });
                if (out.length >= max) return out;
              }
            }
          }
        }
      }
    }
  }

  return out;
}

/**
 * サイトごとの件数取得関数をまとめた dispatcher
 */
async function fetchJobsCountForSite(
  cond: ManualCondition
): Promise<number | null> {
  switch (cond.siteKey) {
    case "mynavi":
      return fetchMynaviJobsCount(cond);

    case "doda":
      return fetchDodaJobsCount(cond);

    // type / 女の転職type など、既に別実装がある場合はここに追加
    // case "type":
    //   return fetchTypeJobsCount(cond);
    // case "womantype":
    //   return fetchWomanTypeJobsCount(cond);

    default:
      return null;
  }
}

/**
 * POST /api/job-boards/manual/run-batch
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    const rawSites = (body.sites ?? []).filter(
      (v): v is SiteKey =>
        v === "mynavi" || v === "doda" || v === "type" || v === "womantype"
    );

    if (rawSites.length === 0) {
      return NextResponse.json(
        { ok: false, error: "サイトが選択されていません。" },
        { status: 400 }
      );
    }

    const conditions = buildConditions(rawSites, body);

    const preview: ManualFetchRow[] = [];

    for (const cond of conditions) {
      const jobsCount = await fetchJobsCountForSite(cond);

      preview.push({
        site_key: cond.siteKey,
        internal_large: cond.internalLarge,
        internal_small: cond.internalSmall,
        prefecture: cond.prefecture,
        age_band: cond.ageBand,
        employment_type: cond.employmentType,
        salary_band: cond.salaryBand,
        jobs_count: jobsCount,
        // 今回は候補者数は未取得のため null 固定
        candidates_count: null,
      });
    }

    // ★ここで DB に履歴保存したい場合は、
    //   tenant_id（req.headers.get("x-tenant-id") など）と preview を使って
    //   Supabase へ insert する処理を挟んでください。
    //
    //   例:
    //   const historyId = await saveManualHistoryToDb(tenantId, preview);
    //
    //   この回答では DB 実装までは含めず、「件数取得が正しく動く」ことを優先しています。

    const note =
      body.saveMode === "history"
        ? "履歴保存は未実装ですが、件数の取得は完了しました。"
        : "プレビューのみ実行しました。";

    return NextResponse.json({
      ok: true,
      preview,
      note,
      // history_id: historyId, // DB 実装時に追加
    });
  } catch (e: any) {
    console.error("manual run-batch error", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ? String(e.message) : String(e),
      },
      { status: 500 }
    );
  }
}
