// web/src/app/job-boards/manual/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import KpiCard from "@/components/KpiCard";
import dynamic from "next/dynamic";

const JobCategoryModal = dynamic(
  () => import("@/components/job-boards/JobCategoryModal"),
  { ssr: false }
);

type SiteKey = "mynavi" | "doda" | "type" | "womantype";

const SITE_OPTIONS: { value: SiteKey; label: string }[] = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];

type PreviewRow = {
  site_key: SiteKey;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

export default function JobBoardsManualPage() {
  // フィルタ（トップのモーダルと同じ設計）
  const [sites, setSites] = useState<SiteKey[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [large, setLarge] = useState<string[]>([]);
  const [small, setSmall] = useState<string[]>([]);
  const [age, setAge] = useState<string[]>([]);
  const [emp, setEmp] = useState<string[]>([]);
  const [sal, setSal] = useState<string[]>([]);
  const [pref, setPref] = useState<string[]>([]);
  const [openCat, setOpenCat] = useState(false);

  const [want, setWant] = useState<number>(12);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [msg, setMsg] = useState("");

  const run = async () => {
    setMsg("");
    setRunning(true);
    setPreview([]);
    try {
      // 1) 実行（countsには保存しない）→ プレビュー取得
      const r = await fetch("/api/job-boards/manual/run-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sites,
          large,
          small,
          age,
          emp,
          sal,
          pref,
          want,
          saveMode: "history", // ★ countsには保存しない
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "run failed");
      const previewRows: PreviewRow[] = Array.isArray(j.preview)
        ? j.preview
        : [];
      setPreview(previewRows);

      // 2) 履歴テーブルに保存（まとめて1レコード）
      const h = await fetch("/api/job-boards/manual/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          params: { sites, large, small, age, emp, sal, pref, want },
          results: previewRows,
        }),
      });
      const hj = await h.json();
      if (!h.ok || !hj?.ok) throw new Error(hj?.error || "save history failed");
      setMsg(
        `実行完了: プレビュー ${previewRows.length} 件を履歴に保存しました`
      );
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setRunning(false);
    }
  };

  const Chip: React.FC<{
    label: string;
    active: boolean;
    onClick: () => void;
  }> = ({ label, active, onClick }) => (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border mr-2 mb-2 ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );

  const sitesLabel = useMemo(() => {
    if (sites.length === SITE_OPTIONS.length) return `全${sites.length}`;
    if (sites.length === 0) return "なし";
    return `${sites.length}件`;
  }, [sites]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              手動実行
            </h1>
            <p className="text-sm text-neutral-500">
              トップの職種モーダルと同じUIで条件選択 → 実行 →
              プレビューを履歴保存
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/job-boards/manual/history"
              className="rounded-lg border border-neutral-200 px-3 py-2 hover:bg-neutral-50 text-sm"
            >
              手動実行履歴
            </Link>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-4">
          <KpiCard label="対象サイト" value={sitesLabel} />
          <KpiCard
            label="大分類"
            value={large.length ? String(large.length) : "すべて"}
          />
          <KpiCard
            label="小分類"
            value={small.length ? String(small.length) : "すべて"}
          />
          <KpiCard label="件数目安" value={String(want)} />
        </div>

        {/* 条件 */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          {/* サイト */}
          <div className="mb-3">
            <div className="mb-1 text-xs text-neutral-600">サイト</div>
            <div className="flex flex-wrap">
              <Chip
                label="すべて"
                active={sites.length === SITE_OPTIONS.length}
                onClick={() => setSites(SITE_OPTIONS.map((s) => s.value))}
              />
              <Chip
                label="解除"
                active={sites.length === 0}
                onClick={() => setSites([])}
              />
              {SITE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={sites.includes(o.value)}
                  onClick={() =>
                    setSites(
                      sites.includes(o.value)
                        ? sites.filter((x) => x !== o.value)
                        : [...sites, o.value]
                    )
                  }
                />
              ))}
            </div>
          </div>

          {/* 職種（トップと同じモーダルUI） */}
          <div className="mb-3">
            <div className="mb-1 text-xs text-neutral-600">職種</div>
            <button
              className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
              onClick={() => setOpenCat(true)}
            >
              選択（大:{large.length || "すべて"} / 小:
              {small.length || "すべて"}）
            </button>
          </div>

          {/* 年齢層/雇用形態/年収帯/都道府県（必要なら入力UIを足す） */}
          {/* 簡易入力：カンマ区切り */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs text-neutral-600">
                年齢層（任意）
              </div>
              <input
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                placeholder="例: 25歳以下, 30歳以下"
                value={age.join(",")}
                onChange={(e) =>
                  setAge(
                    e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                  )
                }
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">
                雇用形態（任意）
              </div>
              <input
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                placeholder="例: 正社員, 契約社員"
                value={emp.join(",")}
                onChange={(e) =>
                  setEmp(
                    e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                  )
                }
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">
                年収帯（任意）
              </div>
              <input
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                placeholder="例: 400~500万"
                value={sal.join(",")}
                onChange={(e) =>
                  setSal(
                    e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                  )
                }
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">
                都道府県（任意）
              </div>
              <input
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                placeholder="例: 大阪府, 東京都"
                value={pref.join(",")}
                onChange={(e) =>
                  setPref(
                    e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                  )
                }
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label className="text-xs text-neutral-600">
              件数目安
              <input
                type="number"
                min={1}
                max={200}
                value={want}
                onChange={(e) =>
                  setWant(Math.max(1, Math.min(200, +e.target.value || 1)))
                }
                className="ml-2 w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
            </label>
            <button
              onClick={run}
              disabled={running || sites.length === 0}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {running ? "実行中…" : "実行する（履歴に保存）"}
            </button>
          </div>
        </section>

        {/* プレビュー */}
        <section className="rounded-2xl border border-neutral-200 overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">大分類</th>
                <th className="px-3 py-3 text-left">小分類</th>
                <th className="px-3 py-3 text-left">年齢層</th>
                <th className="px-3 py-3 text-left">雇用形態</th>
                <th className="px-3 py-3 text-left">年収帯</th>
                <th className="px-3 py-3 text-left">都道府県</th>
                <th className="px-3 py-3 text-left">求人数</th>
                <th className="px-3 py-3 text-left">求職者数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {preview.map((r, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2">{r.site_key}</td>
                  <td className="px-3 py-2">{r.internal_large ?? "-"}</td>
                  <td className="px-3 py-2">{r.internal_small ?? "-"}</td>
                  <td className="px-3 py-2">{r.age_band ?? "-"}</td>
                  <td className="px-3 py-2">{r.employment_type ?? "-"}</td>
                  <td className="px-3 py-2">{r.salary_band ?? "-"}</td>
                  <td className="px-3 py-2">{r.prefecture ?? "-"}</td>
                  <td className="px-3 py-2">{r.jobs_count ?? "-"}</td>
                  <td className="px-3 py-2">{r.candidates_count ?? "-"}</td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    プレビューはありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600">
            {msg}
          </pre>
        )}

        {/* 職種モーダル */}
        {openCat && (
          <JobCategoryModal
            large={large}
            small={small}
            onCloseAction={() => setOpenCat(false)}
            onApplyAction={(L: string[], S: string[]) => {
              setLarge(L);
              setSmall(S);
              setOpenCat(false);
            }}
          />
        )}
      </main>
    </>
  );
}
