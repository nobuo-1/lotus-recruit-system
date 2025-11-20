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

/** 実際にサイトに投げるための最小単位（サイト＋職種＋都道府県） */
type BaseCondition = {
  siteKey: SiteKey;
  internalLarge: string | null;
  internalSmall: string | null;
  prefecture: string | null;
};

/** サイトごとの件数取得 */
async function fetchJobsCountForSite(
  cond: ManualCondition
): Promise<number | null> {
  switch (cond.siteKey) {
    case "mynavi":
      return fetchMynaviJobsCount(cond);
    case "doda":
      return fetchDodaJobsCount(cond);
    // type / 女の転職type などを使う場合はここに追加
    // case "type":
    //   return fetchTypeJobsCount(cond);
    // case "womantype":
    //   return fetchWomanTypeJobsCount(cond);
    default:
      return null;
  }
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

/** 「すべて」の件数だけ入れた層配列を作る（細かい層は今は null） */
function buildLayers(
  labels: readonly { key: string; label: string }[],
  total: number | null
): ManualLayerCount[] {
  return labels.map((b, idx) => ({
    label: b.label,
    jobs_count: idx === 0 ? total : null,
  }));
}

/** POST /api/job-boards/manual/run-batch */
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

    const baseConditions = buildBaseConditions(rawSites, body);
    if (baseConditions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "条件の組み合わせがありません。" },
        { status: 400 }
      );
    }

    // ★ 処理高速化のため、BaseCondition ごとに並列で取得
    const preview: ManualResultRow[] = await Promise.all(
      baseConditions.map(async (base): Promise<ManualResultRow> => {
        const jobsTotal = await fetchJobsCountForSite(toManualCondition(base));

        // ここを拡張すると、「年齢層 / 雇用形態 / 年収帯ごとの件数」を
        // サイトの DOM やパラメータに合わせて実際に埋めていける
        const ageLayers = buildLayers(AGE_BANDS, jobsTotal);
        const empLayers = buildLayers(EMP_TYPES, jobsTotal);
        const salLayers = buildLayers(SALARY_BANDS, jobsTotal);

        return {
          site_key: base.siteKey,
          internal_large: base.internalLarge,
          internal_small: base.internalSmall,
          prefecture: base.prefecture,
          jobs_total: jobsTotal,
          age_layers: ageLayers,
          employment_layers: empLayers,
          salary_layers: salLayers,
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
