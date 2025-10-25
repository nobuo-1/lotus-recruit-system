// web/src/app/job-boards/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import KpiCard from "@/components/KpiCard";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

type Mode = "weekly" | "monthly";
type RangeW = "12w" | "26w" | "52w";
type RangeM = "12m" | "36m";
type Metric = "jobs" | "candidates";

const SITE_OPTIONS: { value: string; label: string }[] = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];

type ApiRow = {
  week_start?: string | null;
  month_start?: string | null;
  site_key: string;
  large_category: string;
  small_category: string;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  jobs_count: number;
  candidates_count: number;
};

type SeriesPoint = { date: string; [site: string]: number | string };

function labelOfMode(mode: Mode) {
  return mode === "weekly" ? "週次" : "月次（各月の最新）";
}

export default function JobBoardsPage() {
  // ===== グラフ側フィルタ（表とは独立） =====
  const [modeChart, setModeChart] = useState<Mode>("weekly");
  const [rangeChart, setRangeChart] = useState<RangeW | RangeM>("26w");
  const [metricChart, setMetricChart] = useState<Metric>("jobs");
  const [sitesChart, setSitesChart] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [largeChart, setLargeChart] = useState<string[]>([]);
  const [smallChart, setSmallChart] = useState<string[]>([]);
  const [ageChart, setAgeChart] = useState<string[]>([]);
  const [empChart, setEmpChart] = useState<string[]>([]);
  const [salChart, setSalChart] = useState<string[]>([]);

  // ===== 表側フィルタ（独立） =====
  const [modeTable, setModeTable] = useState<Mode>("weekly");
  const [rangeTable, setRangeTable] = useState<RangeW | RangeM>("26w");
  const [metricTable, setMetricTable] = useState<Metric>("jobs");
  const [sitesTable, setSitesTable] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [largeTable, setLargeTable] = useState<string[]>([]);
  const [smallTable, setSmallTable] = useState<string[]>([]);
  const [ageTable, setAgeTable] = useState<string[]>([]);
  const [empTable, setEmpTable] = useState<string[]>([]);
  const [salTable, setSalTable] = useState<string[]>([]);

  // ===== データ =====
  const [rowsChart, setRowsChart] = useState<ApiRow[]>([]);
  const [rowsTable, setRowsTable] = useState<ApiRow[]>([]);
  const [msgChart, setMsgChart] = useState("");
  const [msgTable, setMsgTable] = useState("");

  // 総小分類数（ALL表示のため）
  const SMALL_TOTAL = useMemo(
    () => Object.values(JOB_CATEGORIES).reduce((s, arr) => s + arr.length, 0),
    []
  );
  const toAllLabel = (count: number, total: number) =>
    count >= total ? `${total}(ALL)` : `${count || 0}`;

  // ====== フェッチ（グラフ用） ======
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/job-boards/metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: modeChart,
            metric: metricChart,
            sites: sitesChart,
            large: largeChart,
            small: smallChart,
            age: ageChart,
            emp: empChart,
            sal: salChart,
            range: rangeChart,
          }),
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j?.error || "fetch error");
        setRowsChart(j.rows ?? []);
        setMsgChart("");
      } catch (e: any) {
        setRowsChart([]);
        setMsgChart(String(e?.message || e));
      }
    })();
  }, [
    modeChart,
    metricChart,
    rangeChart,
    sitesChart.join(","),
    largeChart.join(","),
    smallChart.join(","),
    ageChart.join(","),
    empChart.join(","),
    salChart.join(","),
  ]);

  // ====== フェッチ（表用） ======
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/job-boards/metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: modeTable,
            metric: metricTable,
            sites: sitesTable,
            large: largeTable,
            small: smallTable,
            age: ageTable,
            emp: empTable,
            sal: salTable,
            range: rangeTable,
          }),
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j?.error || "fetch error");
        setRowsTable(j.rows ?? []);
        setMsgTable("");
      } catch (e: any) {
        setRowsTable([]);
        setMsgTable(String(e?.message || e));
      }
    })();
  }, [
    modeTable,
    metricTable,
    rangeTable,
    sitesTable.join(","),
    largeTable.join(","),
    smallTable.join(","),
    ageTable.join(","),
    empTable.join(","),
    salTable.join(","),
  ]);

  // ===== 折れ線グラフ化 =====
  const dateKeyChart = modeChart === "weekly" ? "week_start" : "month_start";
  const seriesChart: SeriesPoint[] = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {};
    const metricKey =
      metricChart === "jobs" ? "jobs_count" : "candidates_count";
    for (const r of rowsChart) {
      const d = (r as any)[dateKeyChart];
      if (!d) continue;
      byDate[d] ||= {};
      const k = r.site_key;
      byDate[d][k] = (byDate[d][k] ?? 0) + (r as any)[metricKey];
    }
    const dates = Object.keys(byDate).sort();
    return dates.map((d) => {
      const base: SeriesPoint = { date: d };
      for (const s of SITE_OPTIONS.map((x) => x.value))
        base[s] = byDate[d][s] ?? 0;
      return base;
    });
  }, [rowsChart, dateKeyChart, metricChart]);

  // ===== 表（サイト合計） =====
  const tableAgg = useMemo(() => {
    const metricKey =
      metricTable === "jobs" ? "jobs_count" : "candidates_count";
    const bySite: Record<string, number> = {};
    for (const r of rowsTable) {
      bySite[r.site_key] = (bySite[r.site_key] ?? 0) + (r as any)[metricKey];
    }
    return SITE_OPTIONS.filter((s) => sitesTable.includes(s.value))
      .map((s) => ({
        site: s.label,
        key: s.value,
        total: bySite[s.value] ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [rowsTable, metricTable, sitesTable]);

  // ===== 職種モーダル制御 =====
  const [openChartCat, setOpenChartCat] = useState(false);
  const [openTableCat, setOpenTableCat] = useState(false);

  // UIチップ
  const Chip: React.FC<{
    active: boolean;
    onClick: () => void;
    label: string;
  }> = ({ active, onClick, label }) => (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
      } mr-2 mb-2`}
    >
      {label}
    </button>
  );

  // 定義済み選択肢
  const AGE_BANDS = [
    "20歳以下",
    "25歳以下",
    "30歳以下",
    "35歳以下",
    "40歳以下",
    "45歳以下",
    "50歳以下",
    "55歳以下",
    "60歳以下",
    "65歳以下",
  ];
  const EMP_TYPES = [
    "正社員",
    "契約社員",
    "派遣社員",
    "アルバイト",
    "業務委託",
  ];
  const SALARY_BAND = [
    "~300万",
    "300~400万",
    "400~500万",
    "500~600万",
    "600~800万",
    "800万~",
  ];

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル + ナビ */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[26px] md:text-[24px] font-extrabold tracking-tight text-indigo-900">
              転職サイトリサーチ
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              サイト別の求人数／求職者数のトレンド（週次・月次）
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/job-boards/settings"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              通知設定
            </Link>
            <Link
              href="/job-boards/runs"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              実行状況
            </Link>
            <Link
              href="/job-boards/manual"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              手動実行
            </Link>
          </div>
        </div>

        {/* ===== KPI（グラフ側） ===== */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
          <KpiCard
            label="対象サイト"
            value={toAllLabel(sitesChart.length, SITE_OPTIONS.length)}
          />
          <KpiCard
            label="職種（大）"
            value={toAllLabel(largeChart.length, JOB_LARGE.length)}
          />
          <KpiCard
            label="職種（小）"
            value={toAllLabel(smallChart.length, SMALL_TOTAL)}
          />
          <KpiCard label="ビュー" value={labelOfMode(modeChart)} />
        </div>

        {/* ========== グラフブロック ========== */}
        <section className="rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-semibold text-neutral-800">
              折れ線グラフ（サイト重ね描画）
            </div>
            <div className="flex flex-wrap gap-2">
              {(["weekly", "monthly"] as const).map((m) => (
                <Chip
                  key={m}
                  label={m === "weekly" ? "週次" : "月次"}
                  active={modeChart === m}
                  onClick={() => {
                    setModeChart(m);
                    setRangeChart(m === "weekly" ? "26w" : "12m");
                  }}
                />
              ))}
              {(modeChart === "weekly"
                ? (["12w", "26w", "52w"] as const)
                : (["12m", "36m"] as const)
              ).map((r) => (
                <Chip
                  key={r}
                  label={r}
                  active={rangeChart === r}
                  onClick={() => setRangeChart(r)}
                />
              ))}
              {(["jobs", "candidates"] as const).map((k) => (
                <Chip
                  key={k}
                  label={k === "jobs" ? "求人数" : "求職者数"}
                  active={metricChart === k}
                  onClick={() => setMetricChart(k)}
                />
              ))}
            </div>
          </div>

          {/* フィルタ（タグUI） */}
          <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50/40">
            <FilterRow label="サイト">
              <Chip
                active={sitesChart.length === SITE_OPTIONS.length}
                label="すべて"
                onClick={() => setSitesChart(SITE_OPTIONS.map((s) => s.value))}
              />
              <Chip
                active={sitesChart.length === 0}
                label="解除"
                onClick={() => setSitesChart([])}
              />
              {SITE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={sitesChart.includes(o.value)}
                  onClick={() =>
                    setSitesChart(
                      sitesChart.includes(o.value)
                        ? sitesChart.filter((x) => x !== o.value)
                        : [...sitesChart, o.value]
                    )
                  }
                />
              ))}
            </FilterRow>

            <FilterRow label="職種">
              <button
                className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                onClick={() => setOpenChartCat(true)}
              >
                選択（大:{toAllLabel(largeChart.length, JOB_LARGE.length)} / 小:
                {toAllLabel(smallChart.length, SMALL_TOTAL)}）
              </button>
            </FilterRow>

            <FilterRow label="年齢層">
              <TagMulti
                values={ageChart}
                setValues={setAgeChart}
                options={AGE_BANDS}
              />
            </FilterRow>
            <FilterRow label="雇用形態">
              <TagMulti
                values={empChart}
                setValues={setEmpChart}
                options={EMP_TYPES}
              />
            </FilterRow>
            <FilterRow label="年収帯">
              <TagMulti
                values={salChart}
                setValues={setSalChart}
                options={SALARY_BAND}
              />
            </FilterRow>
          </div>

          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {SITE_OPTIONS.filter((s) => sitesChart.includes(s.value)).map(
                  (s) => (
                    <Line
                      key={s.value}
                      type="monotone"
                      dataKey={s.value}
                      dot={false}
                      strokeWidth={2}
                    />
                  )
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {msgChart && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
              {msgChart}
            </pre>
          )}
        </section>

        {/* ========== 表ブロック（独立フィルタ） ========== */}
        <section className="mt-6 rounded-2xl border border-neutral-200 p-4">
          {/* 表側 KPI（同期表示） */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-4">
            <KpiCard
              label="対象サイト"
              value={toAllLabel(sitesTable.length, SITE_OPTIONS.length)}
            />
            <KpiCard
              label="職種（大）"
              value={toAllLabel(largeTable.length, JOB_LARGE.length)}
            />
            <KpiCard
              label="職種（小）"
              value={toAllLabel(smallTable.length, SMALL_TOTAL)}
            />
            <KpiCard label="ビュー" value={labelOfMode(modeTable)} />
          </div>

          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-semibold text-neutral-800">
              サイト別合計（{labelOfMode(modeTable)}）
            </div>
            <div className="flex flex-wrap gap-2">
              {(["weekly", "monthly"] as const).map((m) => (
                <Chip
                  key={m}
                  label={m === "weekly" ? "週次" : "月次"}
                  active={modeTable === m}
                  onClick={() => {
                    setModeTable(m);
                    setRangeTable(m === "weekly" ? "26w" : "12m");
                  }}
                />
              ))}
              {(modeTable === "weekly"
                ? (["12w", "26w", "52w"] as const)
                : (["12m", "36m"] as const)
              ).map((r) => (
                <Chip
                  key={r}
                  label={r}
                  active={rangeTable === r}
                  onClick={() => setRangeTable(r)}
                />
              ))}
              {(["jobs", "candidates"] as const).map((k) => (
                <Chip
                  key={k}
                  label={k === "jobs" ? "求人数" : "求職者数"}
                  active={metricTable === k}
                  onClick={() => setMetricTable(k)}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50/40">
            <FilterRow label="サイト">
              <Chip
                active={sitesTable.length === SITE_OPTIONS.length}
                label="すべて"
                onClick={() => setSitesTable(SITE_OPTIONS.map((s) => s.value))}
              />
              <Chip
                active={sitesTable.length === 0}
                label="解除"
                onClick={() => setSitesTable([])}
              />
              {SITE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={sitesTable.includes(o.value)}
                  onClick={() =>
                    setSitesTable(
                      sitesTable.includes(o.value)
                        ? sitesTable.filter((x) => x !== o.value)
                        : [...sitesTable, o.value]
                    )
                  }
                />
              ))}
            </FilterRow>
            <FilterRow label="職種">
              <button
                className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                onClick={() => setOpenTableCat(true)}
              >
                選択（大:{toAllLabel(largeTable.length, JOB_LARGE.length)} / 小:
                {toAllLabel(smallTable.length, SMALL_TOTAL)}）
              </button>
            </FilterRow>
            <FilterRow label="年齢層">
              <TagMulti
                values={ageTable}
                setValues={setAgeTable}
                options={AGE_BANDS}
              />
            </FilterRow>
            <FilterRow label="雇用形態">
              <TagMulti
                values={empTable}
                setValues={setEmpTable}
                options={EMP_TYPES}
              />
            </FilterRow>
            <FilterRow label="年収帯">
              <TagMulti
                values={salTable}
                setValues={setSalTable}
                options={SALARY_BAND}
              />
            </FilterRow>
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 mt-3">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">サイト</th>
                  <th className="px-3 py-3 text-left">
                    合計（{metricTable === "jobs" ? "求人数" : "求職者数"}）
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableAgg.map((r) => (
                  <tr key={r.key} className="border-t border-neutral-200">
                    <td className="px-3 py-3">{r.site}</td>
                    <td className="px-3 py-3">{r.total}</td>
                  </tr>
                ))}
                {tableAgg.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {msgTable && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
              {msgTable}
            </pre>
          )}
        </section>

        {/* 職種モーダル（グラフ用） */}
        {openChartCat && (
          <CategoryPicker
            large={largeChart}
            small={smallChart}
            onClose={() => setOpenChartCat(false)}
            onApply={(L, S) => {
              setLargeChart(L);
              setSmallChart(S);
              setOpenChartCat(false);
            }}
          />
        )}
        {/* 職種モーダル（表用） */}
        {openTableCat && (
          <CategoryPicker
            large={largeTable}
            small={smallTable}
            onClose={() => setOpenTableCat(false)}
            onApply={(L, S) => {
              setLargeTable(L);
              setSmallTable(S);
              setOpenTableCat(false);
            }}
          />
        )}
      </main>
    </>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-xs font-medium text-neutral-600">{label}</div>
      <div className="flex flex-wrap items-center">{children}</div>
    </div>
  );
}

function TagMulti({
  values,
  setValues,
  options,
}: {
  values: string[];
  setValues: (v: string[]) => void;
  options: string[];
}) {
  const toggle = (v: string) =>
    setValues(
      values.includes(v) ? values.filter((x) => x !== v) : [...values, v]
    );
  const Chip: React.FC<{
    active: boolean;
    onClick: () => void;
    label: string;
  }> = ({ active, onClick, label }) => (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
      } mr-2 mb-2`}
    >
      {label}
    </button>
  );
  return (
    <>
      <Chip
        active={values.length === options.length}
        label="すべて"
        onClick={() => setValues(options)}
      />
      <Chip
        active={values.length === 0}
        label="解除"
        onClick={() => setValues([])}
      />
      {options.map((o) => (
        <Chip
          key={o}
          label={o}
          active={values.includes(o)}
          onClick={() => toggle(o)}
        />
      ))}
    </>
  );
}

/** 職種モーダル：左=大分類（クリックで右の小分類を切替）。大分類複数選択時は右側にグルーピング表示。 */
function CategoryPicker({
  large,
  small,
  onClose,
  onApply,
}: {
  large: string[];
  small: string[];
  onClose: () => void;
  onApply: (L: string[], S: string[]) => void;
}) {
  const [L, setL] = useState<string[]>(large);
  const [S, setS] = useState<string[]>(small);
  const [activeL, setActiveL] = useState<string>(L[0] || JOB_LARGE[0]);

  const toggleL = (v: string) =>
    setL(L.includes(v) ? L.filter((x) => x !== v) : [...L, v]);
  const toggleS = (v: string) =>
    setS(S.includes(v) ? S.filter((x) => x !== v) : [...S, v]);

  // 右ペインに出す対象の大分類
  const rightGroups = useMemo(() => {
    if (L.length === 0) return JOB_LARGE;
    return L;
  }, [L]);

  useEffect(() => {
    if (!rightGroups.includes(activeL))
      setActiveL(rightGroups[0] || JOB_LARGE[0]);
  }, [rightGroups, activeL]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[1000px] max-w-[96vw] max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">職種選択</div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 border hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>

        <div className="p-4 grid grid-cols-12 gap-4 overflow-hidden">
          {/* 左：大分類 */}
          <div className="col-span-4 overflow-y-auto max-h-[70vh]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={L.length === JOB_LARGE.length}
                  onChange={(e) => setL(e.target.checked ? [...JOB_LARGE] : [])}
                />
                大分類 すべて選択
              </label>
            </div>
            <div className="rounded-xl border divide-y">
              {JOB_LARGE.map((lg) => {
                const checked = L.includes(lg);
                const on = activeL === lg;
                return (
                  <div
                    key={lg}
                    onClick={() => setActiveL(lg)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                      on ? "bg-neutral-50" : ""
                    }`}
                  >
                    <div className="text-sm font-medium">{lg}</div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleL(lg)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右：小分類 */}
          <div className="col-span-8 overflow-y-auto max-h-[70vh]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-neutral-800">
                小分類
              </div>
              <label className="text-sm">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={
                    rightGroups.every((g) =>
                      (JOB_CATEGORIES[g] || []).every((s) => S.includes(s))
                    ) && rightGroups.length > 0
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      const union = new Set<string>(S);
                      rightGroups.forEach((g) =>
                        (JOB_CATEGORIES[g] || []).forEach((x) => union.add(x))
                      );
                      setS(Array.from(union));
                    } else {
                      const rest = new Set<string>(S);
                      rightGroups.forEach((g) =>
                        (JOB_CATEGORIES[g] || []).forEach((x) => rest.delete(x))
                      );
                      setS(Array.from(rest));
                    }
                  }}
                />
                表示中の小分類をすべて選択/解除
              </label>
            </div>

            {rightGroups.map((grp) => (
              <div key={grp} id={`grp-${grp}`} className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-indigo-700">
                    {grp}
                  </div>
                  <div className="text-xs text-neutral-500">
                    （{(JOB_CATEGORIES[grp] || []).length}件）
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(JOB_CATEGORIES[grp] || []).map((s) => (
                    <label
                      key={`${grp}-${s}`}
                      className="inline-flex items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={S.includes(s)}
                        onChange={() => toggleS(s)}
                      />
                      <span className="text-sm">{s}</span>
                      <span className="ml-auto text-xs text-neutral-500">
                        ({grp})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
          <button
            onClick={() => {
              setL([]);
              setS([]);
            }}
            className="rounded-lg px-3 py-1 border text-sm"
          >
            クリア
          </button>
          <button
            onClick={() => onApply(L, S)}
            className="rounded-lg px-3 py-1 border text-sm hover:bg-neutral-50"
          >
            適用して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
