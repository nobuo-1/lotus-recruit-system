// web/src/app/job-boards/mappings/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

/** =========================
 * 型定義
 * ========================= */

type SiteKey = "mynavi" | "doda" | "type" | "womantype";

type JobBoardMappingRow = {
  id?: string;
  site_key: SiteKey;
  external_large_code: string | null;
  external_large_label: string | null;
  external_middle_code: string | null;
  external_middle_label: string | null;
  external_small_code: string | null;
  external_small_label: string | null;
  internal_large: string;
  internal_small: string;
  enabled: boolean;
  note: string | null;
  created_at?: string;
  updated_at?: string;
};

// 削除や新規追加がなくなったため、_isNew は不要ですが、
// 既存のロジック構造を維持するため _dirty のみ残します
type EditingRow = JobBoardMappingRow & {
  _dirty?: boolean;
};

/** =========================
 * コンポーネント本体
 * ========================= */

const SITE_OPTIONS: { value: SiteKey; label: string }[] = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];

export default function JobBoardMappingsPage() {
  const [site, setSite] = useState<SiteKey>("mynavi");
  const [rows, setRows] = useState<EditingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [message, stringSetMessage] = useState<string | null>(null);

  // 自社側（内部）カテゴリ選択用
  const [internalLargeFilter, setInternalLargeFilter] = useState<string>(
    JOB_LARGE[0] ?? ""
  );
  const [internalSmallFilter, setInternalSmallFilter] = useState<string>("");

  const setMessage = (msg: string | null) => stringSetMessage(msg);

  /** =========================
   * 内部カテゴリ選択の補助
   * ========================= */

  // 大分類が変わったら、その大分類に属する小分類のうち
  // 1件目をデフォルト選択（既存があれば維持）
  useEffect(() => {
    const smalls = JOB_CATEGORIES[internalLargeFilter] ?? [];
    setInternalSmallFilter((prev) => {
      if (prev && smalls.includes(prev)) return prev;
      return smalls[0] ?? "";
    });
  }, [internalLargeFilter]);

  const internalSmallOptions = useMemo(
    () => JOB_CATEGORIES[internalLargeFilter] ?? [],
    [internalLargeFilter]
  );

  const dirtyCount = useMemo(() => rows.filter((r) => r._dirty).length, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    const lower = q.toLowerCase();
    return rows.filter((r) => {
      const targets = [
        r.external_large_label,
        r.external_middle_label,
        r.external_small_label,
        r.internal_large,
        r.internal_small,
        r.note,
      ]
        .filter(Boolean)
        .join(" / ")
        .toLowerCase();
      return targets.includes(lower);
    });
  }, [rows, query]);

  // 自社大分類 + 小分類 + サイト の組み合わせに紐づく行だけ抽出
  const selectedMappings = useMemo(() => {
    if (!internalLargeFilter || !internalSmallFilter) return [];
    return rows.filter(
      (r) =>
        r.site_key === site &&
        r.internal_large === internalLargeFilter &&
        r.internal_small === internalSmallFilter
    );
  }, [rows, site, internalLargeFilter, internalSmallFilter]);

  /** =========================
   * データ取得
   * ========================= */

  async function fetchRows(selectedSite: SiteKey) {
    setLoading(true);
    setMessage(null);
    try {
      const resp = await fetch(
        `/api/job-boards/mappings?site=${encodeURIComponent(selectedSite)}`
      );
      const j = await resp.json();
      if (!resp.ok || !j.ok) {
        throw new Error(j?.error || "取得に失敗しました。");
      }
      const data = (j.rows ?? []) as JobBoardMappingRow[];
      setRows(
        data.map((r) => ({
          ...r,
          _dirty: false,
        }))
      );
    } catch (e: any) {
      console.error(e);
      setRows([]);
      setMessage(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows(site);
  }, [site]);

  /** =========================
   * 編集系ハンドラ
   * ========================= */

  const handleChange = <K extends keyof EditingRow>(
    id: string | undefined,
    key: K,
    value: EditingRow[K]
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        const next: EditingRow = {
          ...r,
          [key]: value,
        };

        // internal_large を変えたら internal_small をリセット
        if (key === "internal_large") {
          const smalls = JOB_CATEGORIES[value as string] ?? [];
          next.internal_small = smalls[0] ?? "";
        }

        next._dirty = true;
        return next;
      })
    );
  };

  const handleSave = async () => {
    const targets = rows.filter((r) => r._dirty);
    if (targets.length === 0) return;

    setSaving(true);
    setMessage(null);
    try {
      // API側は変更のあった行だけ受け取る仕様と想定
      const payload: JobBoardMappingRow[] = targets.map((r) => {
        const { _dirty, ...rest } = r;
        return rest;
      });

      const resp = await fetch("/api/job-boards/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const j = await resp.json();
      if (!resp.ok || !j.ok) {
        throw new Error(j?.error || "保存に失敗しました。");
      }

      setMessage(j?.message || "マッピングを保存しました。");
      await fetchRows(site);
    } catch (e: any) {
      console.error(e);
      setMessage(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  /** =========================
   * レンダリング
   * ========================= */

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル */}
        <div className="mb-4">
          <h1 className="text-[26px] md:text-[24px] font-extrabold tracking-tight text-indigo-900">
            職種マッピング管理
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            転職サイトごとの職種カテゴリと、自社側の職種カテゴリ（JOB_LARGE /
            JOB_CATEGORIES） とのマッピングを編集します。
            <br />
            ※サイト側の定義やマッピングの削除はできません。
          </p>
        </div>

        {/* 自社カテゴリ × サイトごとのマッピングプレビュー */}
        <section className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-indigo-800">
                自社カテゴリでの割り当て状況
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* 対象サイト */}
                <div>
                  <div className="mb-1 text-xs font-medium text-neutral-700">
                    対象サイト
                  </div>
                  <select
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                    value={site}
                    onChange={(e) => setSite(e.target.value as SiteKey)}
                  >
                    {SITE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 自社・大分類 */}
                <div>
                  <div className="mb-1 text-xs font-medium text-neutral-700">
                    自社・大分類
                  </div>
                  <select
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                    value={internalLargeFilter}
                    onChange={(e) => setInternalLargeFilter(e.target.value)}
                  >
                    {JOB_LARGE.map((L) => (
                      <option key={L} value={L}>
                        {L}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 自社・小分類 */}
                <div>
                  <div className="mb-1 text-xs font-medium text-neutral-700">
                    自社・小分類
                  </div>
                  <select
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                    value={internalSmallFilter}
                    onChange={(e) => setInternalSmallFilter(e.target.value)}
                  >
                    {internalSmallOptions.length === 0 && (
                      <option value="">（小分類なし）</option>
                    )}
                    {internalSmallOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-neutral-600">
                対象サイトと自社の大分類・小分類を選択すると、その組み合わせに割り当てられている
                サイト側の職種（大分類 / 中分類 /
                小分類）が下に一覧表示されます。
              </p>
            </div>

            {/* サマリ情報 */}
            <div className="min-w-[260px] rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs text-neutral-700">
              <div className="font-semibold text-neutral-800 mb-1">
                現在の選択
              </div>
              <div>
                サイト:{" "}
                {SITE_OPTIONS.find((s) => s.value === site)?.label ?? site}
              </div>
              <div>自社・大分類: {internalLargeFilter || "未選択"}</div>
              <div>自社・小分類: {internalSmallFilter || "未選択"}</div>
              <div className="mt-1 text-[11px] text-neutral-500">
                対応するマッピング行数:{" "}
                <span className="font-semibold">
                  {selectedMappings.length} 件
                </span>
              </div>
            </div>
          </div>

          {/* 対応マッピング一覧 */}
          <div className="mt-3 rounded-lg border border-neutral-200 bg-white max-h-[240px] overflow-auto">
            {selectedMappings.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-neutral-400">
                このサイト × 自社大分類 × 自社小分類の組み合わせに
                割り当てられている職種はまだありません。
              </div>
            ) : (
              <table className="min-w-full text-[11px]">
                <thead className="bg-neutral-50 text-neutral-600 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left whitespace-nowrap w-[80px]">
                      大分類CD
                    </th>
                    <th className="px-3 py-2 text-left whitespace-nowrap w-[180px]">
                      大分類ラベル（サイト側）
                    </th>
                    <th className="px-3 py-2 text-left whitespace-nowrap w-[80px]">
                      中分類CD
                    </th>
                    <th className="px-3 py-2 text-left whitespace-nowrap w-[200px]">
                      中分類ラベル（サイト側）
                    </th>
                    <th className="px-3 py-2 text-left whitespace-nowrap w-[80px]">
                      小分類CD
                    </th>
                    <th className="px-3 py-2 text-left whitespace-nowrap w-[220px]">
                      小分類ラベル（サイト側）
                    </th>
                    <th className="px-3 py-2 text-center whitespace-nowrap w-[60px]">
                      有効
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedMappings.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-neutral-200 hover:bg-neutral-50"
                    >
                      <td className="px-3 py-1.5 align-top text-neutral-500">
                        {r.external_large_code}
                      </td>
                      <td className="px-3 py-1.5 align-top font-medium">
                        {r.external_large_label}
                      </td>
                      <td className="px-3 py-1.5 align-top text-neutral-500">
                        {r.external_middle_code}
                      </td>
                      <td className="px-3 py-1.5 align-top">
                        {r.external_middle_label}
                      </td>
                      <td className="px-3 py-1.5 align-top text-neutral-500">
                        {r.external_small_code}
                      </td>
                      <td className="px-3 py-1.5 align-top">
                        {r.external_small_label}
                      </td>
                      <td className="px-3 py-1.5 align-top text-center">
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          readOnly
                          className="cursor-default"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* コントロールバー（一覧テーブル用のフィルタ & 保存） */}
        <section className="mb-4 rounded-2xl border border-neutral-200 p-4 bg-neutral-50/40">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* 検索 */}
              <div>
                <div className="text-xs font-medium text-neutral-600 mb-1">
                  絞り込み（ラベル・自社カテゴリ名）
                </div>
                <input
                  className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="例: 営業, バックエンド..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {/* アクションボタン */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || dirtyCount === 0}
                className={`rounded-lg px-3 py-2 text-xs font-medium ${
                  dirtyCount === 0 || saving
                    ? "border border-neutral-300 text-neutral-400 cursor-not-allowed"
                    : "border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {saving
                  ? "保存中..."
                  : dirtyCount
                  ? `変更を保存 (${dirtyCount})`
                  : "変更はありません"}
              </button>
              <button
                type="button"
                onClick={() => fetchRows(site)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-100"
              >
                再読み込み
              </button>
            </div>
          </div>
        </section>

        {/* メッセージ */}
        {message && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {message}
          </div>
        )}

        {/* 一覧テーブル */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="max-h-[640px] overflow-auto">
            {/* min-w を広げて横スクロールを誘発させる */}
            <table className="min-w-[1400px] w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-600 sticky top-0 z-10 shadow-sm">
                <tr>
                  {/* カラム名は折り返さない (whitespace-nowrap) */}
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[80px]">
                    サイト
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[80px]">
                    大分類CD
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[180px]">
                    大分類ラベル（サイト側）
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[80px]">
                    中分類CD
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[200px]">
                    中分類ラベル（サイト側）
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[80px]">
                    小分類CD
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[200px]">
                    小分類ラベル（サイト側）
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[180px] bg-indigo-50/50">
                    自社・大分類（編集可）
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[200px] bg-indigo-50/50">
                    自社・小分類（編集可）
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap w-[60px]">
                    有効
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      読み込み中です…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      データが見つかりません。
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => {
                    const internalSmalls =
                      JOB_CATEGORIES[r.internal_large] ?? [];
                    const siteLabel =
                      SITE_OPTIONS.find((s) => s.value === r.site_key)?.label ??
                      r.site_key;

                    return (
                      <tr
                        key={r.id}
                        className={
                          r._dirty
                            ? "bg-indigo-50/40 border-t border-neutral-200"
                            : "border-t border-neutral-200 hover:bg-neutral-50"
                        }
                      >
                        <td className="px-3 py-2 align-top">{siteLabel}</td>
                        <td className="px-3 py-2 align-top text-neutral-500">
                          {r.external_large_code}
                        </td>
                        <td className="px-3 py-2 align-top font-medium">
                          {r.external_large_label}
                        </td>
                        <td className="px-3 py-2 align-top text-neutral-500">
                          {r.external_middle_code}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {r.external_middle_label}
                        </td>
                        <td className="px-3 py-2 align-top text-neutral-500">
                          {r.external_small_code}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {r.external_small_label}
                        </td>

                        {/* 自社・大分類（編集可能） */}
                        <td className="px-3 py-2 align-top bg-indigo-50/30">
                          <select
                            className="w-full rounded border border-neutral-300 px-1 py-1 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            value={r.internal_large}
                            onChange={(e) =>
                              handleChange(
                                r.id,
                                "internal_large",
                                e.target.value as any
                              )
                            }
                          >
                            {JOB_LARGE.map((L) => (
                              <option key={L} value={L}>
                                {L}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 自社・小分類（編集可能） */}
                        <td className="px-3 py-2 align-top bg-indigo-50/30">
                          <select
                            className="w-full rounded border border-neutral-300 px-1 py-1 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            value={r.internal_small}
                            onChange={(e) =>
                              handleChange(
                                r.id,
                                "internal_small",
                                e.target.value as any
                              )
                            }
                          >
                            {internalSmalls.length === 0 && (
                              <option value="">（小分類なし）</option>
                            )}
                            {internalSmalls.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 有効フラグ（編集不可） */}
                        <td className="px-3 py-2 align-top text-center">
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            disabled
                            className="cursor-not-allowed opacity-50"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
