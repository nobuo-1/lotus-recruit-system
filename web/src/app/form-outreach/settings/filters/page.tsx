// web/src/app/form-outreach/settings/filters/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Filters = {
  prefectures: string[];
  employee_size_ranges: string[];
  keywords: string[];
  job_titles: string[];
  updated_at?: string | null;
};

const SIZE_OPTS = ["1-9", "10-49", "50-249", "250+"];

export default function FiltersPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    prefectures: [],
    employee_size_ranges: [],
    keywords: [],
    job_titles: [],
    updated_at: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const t = await fetch("/api/me/tenant", { cache: "no-store" }).then(
          (r) => r.json()
        );
        setTenantId(t?.tenant_id ?? null);
        const j = await fetch("/api/form-outreach/settings/filters", {
          cache: "no-store",
        }).then((r) => r.json());
        if (j?.filters) setFilters(j.filters);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const save = async () => {
    if (loading) return;
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/settings/filters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "save failed");
      setFilters((f) => ({ ...f, updated_at: j?.filters?.updated_at ?? null }));
      setMsg("保存しました。");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // 表示用にカンマ区切り文字列
  const txtPref = useMemo(() => filters.prefectures.join(", "), [filters]);
  const txtKw = useMemo(() => filters.keywords.join(", "), [filters]);
  const txtJobs = useMemo(() => filters.job_titles.join(", "), [filters]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              取得フィルタ設定
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span> /
              最終更新:{" "}
              {filters.updated_at ? formatTs(filters.updated_at) : "-"}
            </p>
          </div>
          <button
            onClick={save}
            disabled={loading}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? "保存中…" : "保存"}
          </button>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4 space-y-5">
          {/* 都道府県 */}
          <div>
            <div className="text-sm font-medium text-neutral-800 mb-1">
              都道府県（カンマ区切り・任意）
            </div>
            <input
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="例: 大阪府, 北海道, 東京都"
              value={txtPref}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  prefectures: splitCsv(e.target.value),
                }))
              }
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              空の場合は全国で検索します。
            </p>
          </div>

          {/* 従業員規模 */}
          <div>
            <div className="text-sm font-medium text-neutral-800 mb-1">
              従業員規模（任意）
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {SIZE_OPTS.map((opt) => {
                const checked = filters.employee_size_ranges.includes(opt);
                return (
                  <label key={opt} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          employee_size_ranges: e.target.checked
                            ? [...f.employee_size_ranges, opt]
                            : f.employee_size_ranges.filter((x) => x !== opt),
                        }))
                      }
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>

          {/* キーワード */}
          <div>
            <div className="text-sm font-medium text-neutral-800 mb-1">
              キーワード（カンマ区切り・任意）
            </div>
            <input
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="例: 自社開発, 受託, DX, AI, eコマース"
              value={txtKw}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  keywords: splitCsv(e.target.value),
                }))
              }
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              「採用/募集/求人/recruit」は自動で付与されます。
            </p>
          </div>

          {/* 職種・ロール */}
          <div>
            <div className="text-sm font-medium text-neutral-800 mb-1">
              職種・ロール（カンマ区切り・任意）
            </div>
            <input
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="例: エンジニア, デザイナー, 営業, 事務"
              value={txtJobs}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  job_titles: splitCsv(e.target.value),
                }))
              }
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              職種は検索クエリにも反映されます。
            </p>
          </div>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}

function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
function formatTs(ts: string) {
  try {
    const d = new Date(ts);
    // 日本時間表示
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Tokyo",
      hour12: false,
    }).format(d);
  } catch {
    return ts;
  }
}
