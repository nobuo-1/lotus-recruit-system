// web/src/app/job-boards/mappings/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

/** =========================
 * 型定義（クライアント側にローカルで持つ）
 * ========================= */

// server/job-boards/types.ts と同じ union をここでも定義
type SiteKey = "mynavi" | "doda" | "type" | "womantype";

// job_board_mappings テーブルに対応する型
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

type EditingRow = JobBoardMappingRow & {
  _isNew?: boolean;
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

  const setMessage = (msg: string | null) => stringSetMessage(msg);

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
          _isNew: false,
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

  const handleAddRow = () => {
    const firstLarge = JOB_LARGE[0] ?? "";
    const firstSmall = (firstLarge && JOB_CATEGORIES[firstLarge]?.[0]) ?? "";

    const tmpId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newRow: EditingRow = {
      id: tmpId, // 一時ID（保存時に削除して insert 扱いにする）
      _isNew: true,
      _dirty: true,
      site_key: site,
      external_large_code: null,
      external_large_label: "",
      external_middle_code: null,
      external_middle_label: "",
      external_small_code: null,
      external_small_label: "",
      internal_large: firstLarge,
      internal_small: firstSmall,
      enabled: true,
      note: "",
    };

    setRows((prev) => [newRow, ...prev]);
  };

  const handleDeleteLocal = (id: string | undefined) => {
    if (!id || id.startsWith("new-")) {
      // まだ DB に保存されていない行はローカルで消すだけ
      setRows((prev) => prev.filter((r) => r.id !== id));
      return;
    }

    if (!window.confirm("このマッピングを削除しますか？")) return;

    (async () => {
      try {
        const resp = await fetch(
          `/api/job-boards/mappings?id=${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
        const j = await resp.json();
        if (!resp.ok || !j.ok) {
          throw new Error(j?.error || "削除に失敗しました。");
        }
        setRows((prev) => prev.filter((r) => r.id !== id));
        setMessage("削除しました。");
      } catch (e: any) {
        console.error(e);
        setMessage(String(e?.message ?? e));
      }
    })();
  };

  const handleSave = async () => {
    const targets = rows.filter((r) => r._dirty);
    if (targets.length === 0) return;

    setSaving(true);
    setMessage(null);
    try {
      const payload: JobBoardMappingRow[] = targets.map((r) => {
        const { _dirty, _isNew, ...rest } = r;
        // new- で始まる一時IDは undefined にして insert 扱いにする
        if (rest.id && String(rest.id).startsWith("new-")) {
          (rest as any).id = undefined;
        }
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
            JOB_CATEGORIES） とのマッピングを一覧・編集できます。
          </p>
        </div>

        {/* コントロールバー */}
        <section className="mb-4 rounded-2xl border border-neutral-200 p-4 bg-neutral-50/40">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* サイト選択 */}
              <div>
                <div className="text-xs font-medium text-neutral-600 mb-1">
                  対象サイト
                </div>
                <select
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
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

              {/* 検索 */}
              <div>
                <div className="text-xs font-medium text-neutral-600 mb-1">
                  絞り込み（ラベル・自社カテゴリ名）
                </div>
                <input
                  className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="例: 営業, バックエンド, ITエンジニア..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {/* アクションボタン */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddRow}
                className="rounded-lg border border-indigo-500 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
              >
                + マッピングを追加
              </button>
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

          <div className="mt-2 text-xs text-neutral-500">
            ・マイナビの全職種をもれなく対応させるには、マイナビ側の large_cd /
            middle_cd / small_cd をこのテーブルにすべて登録してください。
            ・「自社側の職種」は
            <code className="mx-1 rounded bg-neutral-100 px-1">
              JOB_LARGE / JOB_CATEGORIES
            </code>
            に連動しています。
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
            <table className="min-w-[960px] w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-2 text-left w-[10%]">サイト</th>
                  <th className="px-3 py-2 text-left w-[10%]">大分類コード</th>
                  <th className="px-3 py-2 text-left w-[14%]">
                    大分類ラベル（サイト側）
                  </th>
                  <th className="px-3 py-2 text-left w-[10%]">中分類コード</th>
                  <th className="px-3 py-2 text-left w-[14%]">
                    中分類ラベル（サイト側）
                  </th>
                  <th className="px-3 py-2 text-left w-[10%]">小分類コード</th>
                  <th className="px-3 py-2 text-left w-[14%]">
                    小分類ラベル（サイト側）
                  </th>
                  <th className="px-3 py-2 text-left w-[10%]">自社・大分類</th>
                  <th className="px-3 py-2 text-left w-[14%]">自社・小分類</th>
                  <th className="px-3 py-2 text-left w-[6%]">有効</th>
                  <th className="px-3 py-2 text-left w-[8%]">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      読み込み中です…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      マッピングがありません。右上の「マッピングを追加」から新規登録してください。
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
                            : "border-t border-neutral-200"
                        }
                      >
                        <td className="px-3 py-2 align-top">{siteLabel}</td>
                        <td className="px-3 py-2 align-top">
                          <input
                            className="w-full rounded border border-neutral-300 px-1 py-1"
                            value={r.external_large_code ?? ""}
                            onChange={(e) =>
                              handleChange(
                                r.id,
                                "external_large_code",
                                e.target.value
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            className="w-full rounded border border-neutral-300 px-1 py-1"
                            value={r.external_large_label ?? ""}
                            onChange={(e) =>
                              handleChange(
                                r.id,
                                "external_large_label",
                                e.target.value
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            className="w-full rounded border border-neutral-300 px-1 py-1"
                            value={r.external_middle_code ?? ""}
                            onChange={(e) =>
                              handleChange(
                                r.id,
                                "external_middle_code",
                                e.target.value
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            className="w-full rounded border border-neutral-300 px-1 py-1"
                            value={r.external_middle_label ?? ""}
                            onChange={(e) =>
                              handleChange(
                                r.id,
                                "external_middle_label",
                                e.target.value
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            className="w-full rounded border border-neutral-300 px-1 py-1"
                            value={r.external_small_code ?? ""}
                            onChange={(e) =>
                              handleChange(
                                r.id,
                                "external_small_code",
                                e.target.value
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            className="w-full rounded border border-neutral-300 px-1 py-1"
                            value={r.external_small_label ?? ""}
                            onChange={(e) =>
                              handleChange(
                                r.id,
                                "external_small_label",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        {/* 自社・大分類 */}
                        <td className="px-3 py-2 align-top">
                          <select
                            className="w-full rounded border border-neutral-300 px-1 py-1"
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

                        {/* 自社・小分類 */}
                        <td className="px-3 py-2 align-top">
                          <select
                            className="w-full rounded border border-neutral-300 px-1 py-1"
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

                        {/* 有効フラグ */}
                        <td className="px-3 py-2 align-top text-center">
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            onChange={(e) =>
                              handleChange(r.id, "enabled", e.target.checked)
                            }
                          />
                        </td>

                        {/* 操作 */}
                        <td className="px-3 py-2 align-top">
                          <button
                            type="button"
                            onClick={() => handleDeleteLocal(r.id)}
                            className="text-[11px] text-red-600 underline underline-offset-2 hover:text-red-700"
                          >
                            削除
                          </button>
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
