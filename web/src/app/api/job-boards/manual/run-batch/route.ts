// web/src/app/api/job-boards/manual/run-batch/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  ManualCondition,
  ManualResultRow,
  SiteKey,
} from "@/server/job-boards/types";

// 条件付き URL 生成 & 件数取得を行う共通モジュール
import {
  fetchMynaviJobsCount,
  fetchMynaviJobsCountForPrefectures,
} from "@/server/job-boards/mynavi";
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

/** サイトごとの統計値（年齢・雇用形態・年収帯は使わない） */
type SiteStats = {
  jobsTotal: number | null;
  /** サイト固有のデバッグ情報（任意） */
  debugInfo?: {
    lines: string[];
  };
};

/** job_board_mappings テーブル行の型（必要な部分だけ） */
type MappingRow = {
  site_key: SiteKey;
  internal_large: string | null;
  internal_small: string | null;
  external_large_code: string | null;
  external_middle_code: string | null;
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

/** BaseCondition → ManualCondition（年齢・雇用形態・年収帯は使わない） */
function toManualCondition(base: BaseCondition): ManualCondition {
  return {
    siteKey: base.siteKey,
    internalLarge: base.internalLarge,
    internalSmall: base.internalSmall,
    prefecture: base.prefecture,
  };
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
        "site_key, internal_large, internal_small, external_large_code, external_middle_code, external_small_code, enabled"
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
 * - マッピングが見つからない場合は元の値をそのまま返す（従来通り）
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
 * マイナビ転職（単一都道府県）:
 * - URL 生成＆HTML 解析は server/job-boards/mynavi.ts 側に委譲
 * - ここでは総件数とデバッグログだけを扱う
 */
async function fetchMynaviStats(cond: ManualCondition): Promise<SiteStats> {
  const result = await fetchMynaviJobsCount(cond);
  const total = result.total;

  const debugLines: string[] = [];
  debugLines.push(
    [
      `mynavi-detail`,
      `url=${result.url}`,
      `prefecture=${cond.prefecture ?? "（指定なし）"}`,
      `prefCode=${result.prefCode ?? "（なし）"}`,
      `source=${result.source}`,
      `modalCount=${result.modalCount ?? "null"}`,
      `headerCount=${result.headerCount ?? "null"}`,
    ].join(" / ")
  );

  return {
    jobsTotal: total,
    debugInfo: { lines: debugLines },
  };
}

/** ========== doda ========== */
async function fetchDodaStats(cond: ManualCondition): Promise<SiteStats> {
  const total = await fetchDodaJobsCount(cond);
  return {
    jobsTotal: total,
  };
}

/** その他サイト：とりあえず総件数も不明として返す（必要に応じて追加） */
async function fetchUnknownSiteStats(
  _cond: ManualCondition
): Promise<SiteStats> {
  return {
    jobsTotal: null,
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

    // デバッグログを蓄積する配列
    const debugLogs: string[] = [];
    const preview: ManualResultRow[] = [];

    /** ===== 1. マイナビ：複数都道府県バッチ処理 ===== */

    // (サイト × 大分類 × 小分類) ごとにグループ化して、prefecture は配列にまとめる
    type MynaviGroup = {
      base: BaseCondition; // prefecture は null 固定で使う
      prefectures: (string | null)[];
    };

    const mynaviGroups = new Map<string, MynaviGroup>();

    for (const base of baseConditions) {
      if (base.siteKey !== "mynavi") continue;

      const key = `mynavi||${base.internalLarge ?? ""}||${
        base.internalSmall ?? ""
      }`;
      const existing = mynaviGroups.get(key);
      if (existing) {
        existing.prefectures.push(base.prefecture);
      } else {
        mynaviGroups.set(key, {
          base: { ...base, prefecture: null },
          prefectures: [base.prefecture],
        });
      }
    }

    // それぞれのマイナビグループについて、複数都道府県をまとめて取得
    for (const group of mynaviGroups.values()) {
      const { base, prefectures } = group;

      // internal → external コード変換
      const mapped = resolveExternalJobCodes(base, mappingsBySite);

      const condBase: ManualCondition = {
        siteKey: base.siteKey,
        internalLarge: mapped.large,
        internalSmall: mapped.small,
        prefecture: null, // URL生成には不要なので null 固定
      };

      const stringPrefs = prefectures.filter(
        (p): p is string => typeof p === "string" && !!p
      );

      const baseInfoPrefix = `[mynavi] internalLarge=${
        base.internalLarge ?? "-"
      } → externalLarge=${mapped.large ?? "-"} / internalSmall=${
        base.internalSmall ?? "-"
      } → externalSmall=${mapped.small ?? "-"}`;

      // 都道府県指定がない（全国のみ）の場合は従来どおり単発で取得
      if (stringPrefs.length === 0) {
        const stats = await fetchMynaviStats(condBase);

        debugLogs.push(
          `${baseInfoPrefix} / prefecture=（指定なし） / jobs_total=${String(
            stats.jobsTotal
          )}`
        );
        if (stats.debugInfo?.lines?.length) {
          for (const line of stats.debugInfo.lines) {
            debugLogs.push(`[mynavi] primary-detail ${line}`);
          }
        }

        preview.push({
          site_key: base.siteKey,
          internal_large: base.internalLarge,
          internal_small: base.internalSmall,
          prefecture: null,
          jobs_total: stats.jobsTotal,
        });

        continue;
      }

      // 都道府県が複数ある場合：Playwright でまとめて取得
      const batchResults = await fetchMynaviJobsCountForPrefectures(
        condBase,
        stringPrefs
      );

      for (const prefName of stringPrefs) {
        const r = batchResults[prefName];

        const jobsTotal =
          r && typeof r.total === "number" && !Number.isNaN(r.total)
            ? r.total
            : null;

        debugLogs.push(
          `${baseInfoPrefix} / prefecture=${prefName} / jobs_total=${String(
            jobsTotal
          )}`
        );
        if (r) {
          debugLogs.push(
            [
              "[mynavi] primary-detail",
              `mynavi-detail`,
              `url=${r.url}`,
              `prefecture=${prefName}`,
              `prefCode=${r.prefCode ?? "（なし）"}`,
              `source=${r.source}`,
              `modalCount=${r.modalCount ?? "null"}`,
              `headerCount=${r.headerCount ?? "null"}`,
            ].join(" / ")
          );
        }

        preview.push({
          site_key: base.siteKey,
          internal_large: base.internalLarge,
          internal_small: base.internalSmall,
          prefecture: prefName,
          jobs_total: jobsTotal,
        });
      }
    }

    /** ===== 2. マイナビ以外（doda / type / womantype）は従来どおり ===== */

    const otherConditions = baseConditions.filter(
      (b) => b.siteKey !== "mynavi"
    );

    for (const base of otherConditions) {
      const mapped = resolveExternalJobCodes(base, mappingsBySite);

      let cond: ManualCondition = {
        ...toManualCondition(base),
        internalLarge: mapped.large,
        internalSmall: mapped.small,
      };

      let stats = await fetchStatsForSite(cond);

      const baseInfo = `[${base.siteKey}] internalLarge=${
        base.internalLarge ?? "-"
      } → externalLarge=${mapped.large ?? "-"} / internalSmall=${
        base.internalSmall ?? "-"
      } → externalSmall=${mapped.small ?? "-"} / prefecture=${
        base.prefecture ?? "（指定なし）"
      }`;

      const pushDebugInfo = (tag: string, s: SiteStats) => {
        if (s.debugInfo?.lines?.length) {
          for (const line of s.debugInfo.lines) {
            debugLogs.push(`[${base.siteKey}] ${tag} ${line}`);
          }
        }
      };

      // doda だけ fallback ロジックを維持（マッピング不整合などの保険）
      if (
        (stats.jobsTotal == null || Number.isNaN(stats.jobsTotal)) &&
        base.siteKey === "doda"
      ) {
        const fallbackCond: ManualCondition = toManualCondition(base);
        const fallbackStats = await fetchStatsForSite(fallbackCond);

        debugLogs.push(
          `${baseInfo} / primary=${String(stats.jobsTotal)} / fallback=${String(
            fallbackStats.jobsTotal
          )}`
        );

        pushDebugInfo("primary-detail", stats);
        pushDebugInfo("fallback-detail", fallbackStats);

        if (
          typeof fallbackStats.jobsTotal === "number" &&
          !Number.isNaN(fallbackStats.jobsTotal)
        ) {
          stats = fallbackStats;
          cond = fallbackCond;
        }
      } else {
        debugLogs.push(`${baseInfo} / jobs_total=${String(stats.jobsTotal)}`);
        pushDebugInfo("primary-detail", stats);
      }

      preview.push({
        site_key: base.siteKey,
        internal_large: base.internalLarge,
        internal_small: base.internalSmall,
        prefecture: base.prefecture,
        jobs_total: stats.jobsTotal,
      });
    }

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
