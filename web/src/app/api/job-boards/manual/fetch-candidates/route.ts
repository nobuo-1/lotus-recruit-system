// web/src/app/api/job-boards/manual/fetch-candidates/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { SiteKey } from "@/server/job-boards/types";
import {
  fetchCandidateCountForCondition,
  fetchCandidateCountFromUrl,
  type CandidateCountResult,
  type CandidateFetchContext,
} from "@/server/job-boards/candidates";
import {
  saveJobBoardManualHistory,
  type ManualHistoryStatus,
} from "@/server/job-boards/manualHistory";

type RequestBody = {
  /** 旧来互換: 単一サイト指定 */
  siteKey?: SiteKey;
  /**
   * 取得対象のスカウト検索URL
   * 例:
   *  https://tenshoku.mynavi.jp/client/scout/index.cfm?chkcd=...&fuseaction=ctsm_listScoutTarget_form&plan_id=1&contract_id=2&job_seq_no=1&scout_classify_id=7&...
   */
  url?: string;
  /** 新版: 対象サイトの配列 */
  sites?: SiteKey[];
  /** 新版: サイトごとのスカウト検索URL */
  scoutUrls?: Record<string, string>;
  /** 条件の履歴保存用 */
  large?: string[];
  small?: string[];
  pref?: string[];
};

type CandidateResult = CandidateCountResult & {
  siteKey: SiteKey;
  internalLarge?: string | null;
  internalSmall?: string | null;
  prefecture?: string | null;
  debugLogs?: string[];
};

function isValidSiteKey(siteKey: string): siteKey is SiteKey {
  return (
    siteKey === "mynavi" ||
    siteKey === "doda" ||
    siteKey === "type" ||
    siteKey === "womantype"
  );
}

function listOrNull(values: string[] | undefined) {
  return Array.isArray(values) && values.length > 0 ? values : [null];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const scoutUrls = {
      ...(body.scoutUrls || {}),
    } as Record<string, string>;

    if (body.siteKey && body.url) {
      scoutUrls[body.siteKey] = body.url;
    }

    const sites = Array.isArray(body.sites)
      ? body.sites.filter((s) => isValidSiteKey(s))
      : [];
    if (body.siteKey && isValidSiteKey(body.siteKey)) {
      if (!sites.includes(body.siteKey)) sites.push(body.siteKey);
    }

    if (sites.length === 0) {
      return NextResponse.json(
        { ok: false, error: "取得対象サイトが指定されていません。" },
        { status: 400 }
      );
    }

    const results: CandidateResult[] = [];

    const context: CandidateFetchContext = {};

    for (const siteKey of sites) {
      const url = scoutUrls[siteKey];
      if (url) {
        const result = await fetchCandidateCountFromUrl(siteKey, url, context);
        results.push({
          ...result,
          siteKey,
          debugLogs:
            siteKey === "mynavi" ? (context.mynaviDebugLogs ?? []) : undefined,
        });
        continue;
      }

      for (const internalLarge of listOrNull(body.large)) {
        for (const internalSmall of listOrNull(body.small)) {
          for (const prefecture of listOrNull(body.pref)) {
            const result = await fetchCandidateCountForCondition(
              {
                siteKey,
                internalLarge,
                internalSmall,
                prefecture,
              },
              context
            );
            results.push({
              ...result,
              siteKey,
              internalLarge,
              internalSmall,
              prefecture,
              debugLogs:
                siteKey === "mynavi"
                  ? (context.mynaviDebugLogs ?? [])
                  : undefined,
            });
          }
        }
      }
    }

    const fetchedCount = results.reduce((sum, r) => {
      const v = typeof r.total === "number" ? r.total : 0;
      return sum + v;
    }, 0);

    const successCount = results.filter(
      (r) => typeof r.total === "number" && !Number.isNaN(r.total)
    ).length;
    const failureCount = Math.max(0, results.length - successCount);
    const historyStatus: ManualHistoryStatus =
      successCount === 0
        ? "failed"
        : failureCount > 0
          ? "partial"
          : "success";

    let historyId: string | null = null;
    let historyError: string | null = null;
    try {
      const saved = await saveJobBoardManualHistory({
        req,
        body,
        params: {
          action_type: "candidates",
          status: historyStatus,
          sites,
          large: body.large ?? [],
          small: body.small ?? [],
          pref: body.pref ?? [],
          fetched_count: fetchedCount,
          success_count: successCount,
          failure_count: failureCount,
          preview_count: results.length,
          note:
            historyStatus === "failed"
              ? "求職者取得に失敗しました。"
              : historyStatus === "partial"
                ? "一部失敗ありで求職者数を取得しました。"
                : "求職者数を取得しました。",
        },
        results,
        resultCount: fetchedCount,
      });
      historyId = saved.id;
    } catch (err: unknown) {
      historyError = err instanceof Error ? err.message : String(err);
      console.error("fetch-candidates history save error", err);
    }

    return NextResponse.json(
      {
        ok: true,
        results,
        fetchedCount,
        history_id: historyId,
        history_error: historyError,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    console.error("fetch-candidates error", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
