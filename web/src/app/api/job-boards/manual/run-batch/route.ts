// web/src/app/api/job-boards/manual/run-batch/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  ManualCondition,
  ManualResultRow,
  ManualLayerCount,
  SiteKey,
  AGE_BANDS,
  EMP_TYPES,
  SALARY_BANDS,
} from "@/server/job-boards/types";

// 条件付き URL 生成 & 件数取得を行う共通モジュール
import { fetchMynaviJobsCount } from "@/server/job-boards/mynavi";
import { fetchDodaJobsCount } from "@/server/job-boards/doda";

type RequestBody = {
  sites?: string[];
  large?: string[];
  small?: string[];
  pref?: string[];
  want?: number;
  saveMode?: string;
};

type BaseCondition = {
  siteKey: SiteKey;
  internalLarge: string | null;
  internalSmall: string | null;
  prefecture: string | null;
};

/** サイトごとの統計値 */
type SiteStats = {
  jobsTotal: number | null;
  ageLayers: ManualLayerCount[];
  empLayers: ManualLayerCount[];
  salaryLayers: ManualLayerCount[];
};

/** ========== util ========== */

function isValidSiteKey(v: string): v is SiteKey {
  return v === "mynavi" || v === "doda" || v === "type" || v === "womantype";
}

/** body から BaseCondition の組み合わせを作る（サイト × 大分類 × 小分類 × 都道府県） */
function buildBaseConditions(
  sites: SiteKey[],
  body: RequestBody
): BaseCondition[] {
  const largeList = body.large && body.large.length > 0 ? body.large : [null];
  const smallList = body.small && body.small.length > 0 ? body.small : [null];
  const prefList = body.pref && body.pref.length > 0 ? body.pref : [null];

  const max = typeof body.want === "number" && body.want > 0 ? body.want : 50;

  const out: BaseCondition[] = [];

  for (const siteKey of sites) {
    for (const L of largeList) {
      for (const S of smallList) {
        for (const P of prefList) {
          out.push({
            siteKey,
            internalLarge: L,
            internalSmall: S,
            prefecture: P,
          });
          if (out.length >= max) return out;
        }
      }
    }
  }

  return out;
}

/** BaseCondition → ManualCondition（年齢・雇用形態・年収帯はここでは未指定） */
function toManualCondition(base: BaseCondition): ManualCondition {
  return {
    siteKey: base.siteKey,
    internalLarge: base.internalLarge,
    internalSmall: base.internalSmall,
    prefecture: base.prefecture,
    ageBand: null,
    employmentType: null,
    salaryBand: null,
  };
}

/** 「すべて」だけ値を入れた層配列を作る */
function buildAllOnlyLayers(
  defs: readonly { key: string; label: string }[],
  total: number | null
): ManualLayerCount[] {
  return defs.map((d, idx) => ({
    key: d.key,
    label: d.label,
    jobs_count: idx === 0 ? total : null,
  }));
}

/** ========== マイナビ転職 ========== */
/**
 * マイナビ転職:
 * - URL 生成＆HTML 解析は server/job-boards/mynavi.ts 側に委譲
 * - ここでは「この条件の求人数」の総件数だけ受け取り、
 *   年齢層 / 雇用形態 / 年収帯 は「すべて」のみ埋める
 */
async function fetchMynaviStats(cond: ManualCondition): Promise<SiteStats> {
  const total = await fetchMynaviJobsCount(cond);

  return {
    jobsTotal: total,
    ageLayers: buildAllOnlyLayers(AGE_BANDS, total),
    empLayers: buildAllOnlyLayers(EMP_TYPES, total),
    salaryLayers: buildAllOnlyLayers(SALARY_BANDS, total),
  };
}

/** ========== doda ========== */
/**
 * doda:
 * - URL 生成＆HTML 解析は server/job-boards/doda.ts 側に委譲
 * - ここでは総件数だけ受け取り、
 *   雇用形態などの分布は現時点では「すべて」のみ埋める簡易版
 */
async function fetchDodaStats(cond: ManualCondition): Promise<SiteStats> {
  const total = await fetchDodaJobsCount(cond);

  return {
    jobsTotal: total,
    ageLayers: buildAllOnlyLayers(AGE_BANDS, total),
    empLayers: buildAllOnlyLayers(EMP_TYPES, total),
    salaryLayers: buildAllOnlyLayers(SALARY_BANDS, total),
  };
}

/** その他サイト：とりあえず総件数も不明として返す（必要に応じて追加） */
async function fetchUnknownSiteStats(
  _cond: ManualCondition
): Promise<SiteStats> {
  const layersEmpty = buildAllOnlyLayers(AGE_BANDS, null);
  return {
    jobsTotal: null,
    ageLayers: layersEmpty,
    empLayers: buildAllOnlyLayers(EMP_TYPES, null),
    salaryLayers: buildAllOnlyLayers(SALARY_BANDS, null),
  };
}

/** サイトごとの stats dispatcher */
async function fetchStatsForSite(cond: ManualCondition): Promise<SiteStats> {
  switch (cond.siteKey) {
    case "mynavi":
      return fetchMynaviStats(cond);
    case "doda":
      return fetchDodaStats(cond);
    case "type":
    case "womantype":
    default:
      return fetchUnknownSiteStats(cond);
  }
}

/** ========== handler ========== */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    const rawSites = (body.sites ?? []).filter(isValidSiteKey);
    if (rawSites.length === 0) {
      return NextResponse.json(
        { ok: false, error: "サイトが選択されていません。" },
        { status: 400 }
      );
    }

    const baseConditions = buildBaseConditions(rawSites, body);
    if (baseConditions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "条件の組み合わせがありません。" },
        { status: 400 }
      );
    }

    // 条件ごとにサイトへアクセス → 結果を rows に格納
    const preview: ManualResultRow[] = await Promise.all(
      baseConditions.map(async (base): Promise<ManualResultRow> => {
        const cond = toManualCondition(base);
        const stats = await fetchStatsForSite(cond);

        return {
          site_key: base.siteKey,
          internal_large: base.internalLarge,
          internal_small: base.internalSmall,
          prefecture: base.prefecture,
          jobs_total: stats.jobsTotal,
          age_layers: stats.ageLayers,
          employment_layers: stats.empLayers,
          salary_layers: stats.salaryLayers,
        };
      })
    );

    const note =
      body.saveMode === "history"
        ? "履歴保存は未実装ですが、件数の取得は完了しました。"
        : "プレビューのみ実行しました。";

    return NextResponse.json({
      ok: true,
      preview,
      note,
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
