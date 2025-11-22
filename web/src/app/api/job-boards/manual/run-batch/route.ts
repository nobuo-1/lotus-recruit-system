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
import { supabaseServer } from "@/lib/supabaseServer";

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

/** job_board_mappings テーブル行の型（必要な部分だけ） */
type MappingRow = {
  site_key: SiteKey;
  internal_large: string | null;
  internal_small: string | null;
  external_large_code: string | null;
  external_small_code: string | null;
  enabled: boolean | null;
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

/** ========== job_board_mappings を利用した職種マッピング ========== */

/**
 * job_board_mappings から、対象サイト & internal_large / internal_small に
 * 対応する外部コードをまとめて取得する
 */
async function loadJobBoardMappings(
  sites: SiteKey[],
  body: RequestBody
): Promise<Map<SiteKey, MappingRow[]>> {
  const internalLarges = (body.large ?? []).filter((v) => !!v);
  const internalSmalls = (body.small ?? []).filter((v) => !!v);

  // 職種フィルタが一切ない場合は問い合わせ不要
  if (internalLarges.length === 0 && internalSmalls.length === 0) {
    return new Map();
  }

  try {
    const sb = await supabaseServer();

    let query = sb
      .from("job_board_mappings")
      .select(
        "site_key, internal_large, internal_small, external_large_code, external_small_code, enabled"
      )
      .in("site_key", sites);

    if (internalLarges.length > 0) {
      query = query.in("internal_large", internalLarges);
    }
    if (internalSmalls.length > 0) {
      // internal_small が null の行はここでは対象外（small 未指定ケースは large 側のマッチで拾う）
      query = query.in("internal_small", internalSmalls);
    }

    const { data, error } = await query;

    if (error) {
      console.error("loadJobBoardMappings error", error);
      return new Map();
    }
    if (!data) return new Map();

    const map = new Map<SiteKey, MappingRow[]>();

    for (const raw of data as MappingRow[]) {
      if (raw.enabled === false) continue;

      const siteKey = raw.site_key;
      const current = map.get(siteKey) ?? [];
      current.push(raw);
      map.set(siteKey, current);
    }

    return map;
  } catch (err) {
    console.error("loadJobBoardMappings unexpected error", err);
    return new Map();
  }
}

/**
 * 1つの BaseCondition（internal_large / internal_small）から、
 * job_board_mappings を使ってサイト固有の外部コードに変換する。
 *
 * - internal_small が指定されていれば small 優先でマッピング
 * - internal_small がなく internal_large のみの場合は large 基準でマッピング
 * - マッピングが見つからない場合は元の値をそのまま返す（従来通り fw などに落ちる）
 */
function resolveExternalJobCodes(
  base: BaseCondition,
  mappingsBySite: Map<SiteKey, MappingRow[]>
): { large: string | null; small: string | null } {
  const L = base.internalLarge || null;
  const S = base.internalSmall || null;

  const siteMappings = mappingsBySite.get(base.siteKey) ?? [];

  // --- small が指定されている場合: internal_small 優先 ---
  if (S) {
    // internal_large も一致する行があれば最優先
    let row =
      siteMappings.find(
        (m) => m.internal_small === S && (!L || m.internal_large === L)
      ) ??
      // large が一致しない場合でも、とにかく small が一致する行を探す
      siteMappings.find((m) => m.internal_small === S);

    if (row) {
      return {
        large: row.external_large_code || row.internal_large || L,
        small: row.external_small_code || S,
      };
    }
  }

  // --- small がなく large のみ指定されている場合 ---
  if (L) {
    // internal_small が null/空 の行を優先しつつ、internal_large が一致する行を探す
    let row =
      siteMappings.find(
        (m) =>
          m.internal_large === L &&
          (m.internal_small === null || m.internal_small === "")
      ) ?? siteMappings.find((m) => m.internal_large === L);

    if (row) {
      return {
        large: row.external_large_code || L,
        small: row.external_small_code || null,
      };
    }
  }

  // マッピングが見つからない場合は、そのまま返す（従来通りの挙動）
  return { large: L, small: S };
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

    // 職種フィルターに対応する job_board_mappings を事前に読み込む
    const mappingsBySite = await loadJobBoardMappings(rawSites, body);

    const debugLogs: string[] = [];

    // 条件ごとにサイトへアクセス → 結果を rows に格納
    const preview: ManualResultRow[] = await Promise.all(
      baseConditions.map(async (base): Promise<ManualResultRow> => {
        // 1. internal_large / internal_small → サイト固有の external コードへ変換
        const mapped = resolveExternalJobCodes(base, mappingsBySite);

        // 2. ManualCondition に反映（ここで渡す値が、mynavi/doda 側で URL パラメータになる）
        const cond: ManualCondition = {
          ...toManualCondition(base),
          internalLarge: mapped.large,
          internalSmall: mapped.small,
        };

        const stats = await fetchStatsForSite(cond);

        // デバッグログ（画面に返す）
        debugLogs.push(
          [
            `[${base.siteKey}]`,
            `internalLarge=${base.internalLarge ?? "-"} → externalLarge=${
              mapped.large ?? "-"
            }`,
            `internalSmall=${base.internalSmall ?? "-"} → externalSmall=${
              mapped.small ?? "-"
            }`,
            `prefecture=${base.prefecture ?? "（指定なし）"}`,
            `jobs_total=${stats.jobsTotal ?? "null"}`,
          ].join(" / ")
        );

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
      debugLogs,
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
