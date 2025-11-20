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

/** 数字文字列 → number */
function parseNumberLike(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = input.replace(/[^\d]/g, "");
  if (!m) return null;
  const n = Number(m);
  return Number.isFinite(n) ? n : null;
}

/** fetch with 簡易タイムアウト */
async function fetchWithTimeout(
  url: string,
  ms = 15000
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; LotusJobBoardBot/1.0; +https://example.com/)",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** ========== マイナビ転職 ========== */
/**
 * いまの実装では：
 * - 職種 / 都道府県はまだ URL パラメータに反映していません（今後 srAreaCdList 等にマッピングする想定）
 * - 総件数は js__searchRecruit--count から取得
 * - 年齢層 / 雇用形態 / 年収帯 は「すべて」のみ埋める
 */
async function fetchMynaviStats(cond: ManualCondition): Promise<SiteStats> {
  const baseUrl =
    "https://tenshoku.mynavi.jp/list/?jobsearchType=14&searchType=18";

  // TODO: cond.internalLarge / internalSmall / prefecture を
  //  マイナビの職種コード・エリアコードにマッピングする場合はここで URL を組み立てる
  const html = await fetchWithTimeout(baseUrl);
  if (!html) {
    const layersEmpty = buildAllOnlyLayers(AGE_BANDS, null);
    return {
      jobsTotal: null,
      ageLayers: layersEmpty,
      empLayers: buildAllOnlyLayers(EMP_TYPES, null),
      salaryLayers: buildAllOnlyLayers(SALARY_BANDS, null),
    };
  }

  const totalMatch = html.match(
    /js__searchRecruit--count[^>]*>([\d,]+)<\/span>/
  );
  const total = parseNumberLike(totalMatch?.[1] ?? "");

  return {
    jobsTotal: total,
    // いったん「すべて」だけ入れておく（その他の層は null）
    ageLayers: buildAllOnlyLayers(AGE_BANDS, total),
    empLayers: buildAllOnlyLayers(EMP_TYPES, total),
    salaryLayers: buildAllOnlyLayers(SALARY_BANDS, total),
  };
}

/** ========== doda ========== */
/**
 * doda:
 * - URL は提示いただいた検索結果 URL
 * - 総件数：サイドバー「この条件の求人数 〜件」の数字
 * - 雇用形態：サイドバー「雇用形態」内の checkBox に書かれている件数をパース
 * - 年齢層 / 年収帯：現時点では該当する分布のカウント情報が HTML から取れないため「すべて」のみ
 */
async function fetchDodaStats(cond: ManualCondition): Promise<SiteStats> {
  const baseUrl =
    "https://doda.jp/DodaFront/View/JobSearchList.action?sid=TopSearch&usrclk=PC_logout_kyujinSearchArea_searchButton";

  // TODO: cond.internalLarge / internalSmall / prefecture を
  // doda のパラメータ（職種・勤務地）にマッピングする場合はここで URL を組み立てる
  const html = await fetchWithTimeout(baseUrl);
  if (!html) {
    const layersEmpty = buildAllOnlyLayers(AGE_BANDS, null);
    return {
      jobsTotal: null,
      ageLayers: layersEmpty,
      empLayers: buildAllOnlyLayers(EMP_TYPES, null),
      salaryLayers: buildAllOnlyLayers(SALARY_BANDS, null),
    };
  }

  // 総件数
  const totalMatch = html.match(
    /この条件の求人数<span[^>]*class="search-sidebar__total-count__number"[^>]*>([\d,]+)<\/span>件/
  );
  const total = parseNumberLike(totalMatch?.[1] ?? "");

  // 雇用形態 部分だけをざっくり切り出し
  const sectionIndex = html.indexOf("雇用形態");
  let empSection = "";
  if (sectionIndex !== -1) {
    const after = html.slice(sectionIndex);
    const ulIndex = after.indexOf("searchCheckboxList__container");
    if (ulIndex !== -1) {
      const part = after.slice(ulIndex);
      const endIndex = part.indexOf("</ul>");
      if (endIndex !== -1) {
        empSection = part.slice(0, endIndex + 5);
      }
    }
  }

  const empCountMap: Record<string, number> = {};

  if (empSection) {
    const re =
      /<span class="checkboxItem__title">([^<]+)<\/span><span class="checkboxItem__numberOfJobs">\((?:<!-- -->)?([\d,]+)(?:<!-- -->)?\)<\/span>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(empSection))) {
      const title = m[1]?.trim() ?? "";
      const num = parseNumberLike(m[2]) ?? 0;
      let key: string;

      if (title.includes("正社員")) key = "fulltime";
      else if (title.includes("契約社員")) key = "contract";
      else if (title.includes("派遣")) key = "haken";
      else if (title.includes("アルバイト") || title.includes("パート"))
        key = "part";
      else if (title.includes("FCオーナー") || title.includes("業務委託"))
        key = "outsourcing";
      else key = "other"; // アプリで個別定義していない雇用形態

      empCountMap[key] = (empCountMap[key] ?? 0) + num;
    }
  }

  const ageLayers = buildAllOnlyLayers(AGE_BANDS, total);

  const empLayers: ManualLayerCount[] = EMP_TYPES.map((e, idx) => ({
    key: e.key,
    label: e.label,
    jobs_count:
      idx === 0
        ? total
        : typeof empCountMap[e.key] === "number"
        ? empCountMap[e.key]
        : null,
  }));

  const salaryLayers = buildAllOnlyLayers(SALARY_BANDS, total);

  return {
    jobsTotal: total,
    ageLayers,
    empLayers,
    salaryLayers,
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
