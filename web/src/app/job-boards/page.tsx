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
import JobCategoryModal from "@/components/job-boards/JobCategoryModal";

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
  age_band: string;
  employment_type: string;
  salary_band: string;
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
  const [showFiltersChart, setShowFiltersChart] = useState<boolean>(true);

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
  const [showFiltersTable, setShowFiltersTable] = useState<boolean>(true);

  // ===== データ =====
  const [rowsChart, setRowsChart] = useState<ApiRow[]>([]);
  const [rowsTable, setRowsTable] = useState<ApiRow[]>([]);
  const [msgChart, setMsgChart] = useState("");
  const [msgTable, setMsgTable] = useState("");

  // グラフ用データ取得
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/job-boards/metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: modeChart,
            metric: metricChart,
            // 空配列は「全選択扱い」にするため API 側で解釈
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

  // 表用データ取得
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

  // 折れ線グラフ化
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

  // 表（サイト合計）
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

  // 職種モーダル制御
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

  // ALL 表示ヘルパ（全選択時 N(ALL)）
  const allText = (selectedLen: number, totalLen: number) =>
    selectedLen === totalLen ? `${selectedLen}(ALL)` : selectedLen || "すべて";

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

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
          <KpiCard
            label="対象サイト"
            value={allText(sitesChart.length, SITE_OPTIONS.length)}
          />
          <KpiCard label="職種（大）" value={allText(largeChart.length, 19)} />
          <KpiCard label="職種（小）" value={smallChart.length || "すべて"} />
          <KpiCard label="ビュー" value={labelOfMode(modeChart)} />
        </div>

        {/* ========== グラフブロック ========== */}
        <section className="rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-semibold text-neutral-800">
              折れ線グラフ（サイト重ね描画）
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowFiltersChart((v) => !v)}
                className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
              >
                フィルタを{showFiltersChart ? "隠す" : "表示"}
              </button>
            </div>
          </div>

          {/* フィルタ（タグUI） */}
          {showFiltersChart && (
            <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50/40">
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  ビュー/範囲/指標
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

              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  サイト
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    active={sitesChart.length === SITE_OPTIONS.length}
                    label="すべて"
                    onClick={() =>
                      setSitesChart(SITE_OPTIONS.map((s) => s.value))
                    }
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
                </div>
              </div>

              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  職種
                </div>
                <button
                  className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                  onClick={() => setOpenChartCat(true)}
                >
                  選択（大:{largeChart.length || "すべて"} / 小:
                  {smallChart.length || "すべて"}）
                </button>
              </div>

              <RowTag
                label="年齢層"
                values={ageChart}
                setValues={setAgeChart}
                options={[
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
                ]}
              />
              <RowTag
                label="雇用形態"
                values={empChart}
                setValues={setEmpChart}
                options={[
                  "正社員",
                  "契約社員",
                  "派遣社員",
                  "アルバイト",
                  "業務委託",
                ]}
              />
              <RowTag
                label="年収帯"
                values={salChart}
                setValues={setSalChart}
                options={[
                  "~300万",
                  "300~400万",
                  "400~500万",
                  "500~600万",
                  "600~800万",
                  "800万~",
                ]}
              />
            </div>
          )}

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
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-semibold text-neutral-800">
              サイト別合計（{labelOfMode(modeTable)}）
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowFiltersTable((v) => !v)}
                className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
              >
                フィルタを{showFiltersTable ? "隠す" : "表示"}
              </button>
            </div>
          </div>

          {showFiltersTable && (
            <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50/40">
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  ビュー/範囲/指標
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

              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  サイト
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    active={sitesTable.length === SITE_OPTIONS.length}
                    label="すべて"
                    onClick={() =>
                      setSitesTable(SITE_OPTIONS.map((s) => s.value))
                    }
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
                </div>
              </div>

              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  職種
                </div>
                <button
                  className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                  onClick={() => setOpenTableCat(true)}
                >
                  選択（大:{largeTable.length || "すべて"} / 小:
                  {smallTable.length || "すべて"}）
                </button>
              </div>

              <RowTag
                label="年齢層"
                values={ageTable}
                setValues={setAgeTable}
                options={[
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
                ]}
              />
              <RowTag
                label="雇用形態"
                values={empTable}
                setValues={setEmpTable}
                options={[
                  "正社員",
                  "契約社員",
                  "派遣社員",
                  "アルバイト",
                  "業務委託",
                ]}
              />
              <RowTag
                label="年収帯"
                values={salTable}
                setValues={setSalTable}
                options={[
                  "~300万",
                  "300~400万",
                  "400~500万",
                  "500~600万",
                  "600~800万",
                  "800万~",
                ]}
              />
            </div>
          )}

          {/* 表上にもKPIミニ（選択が同期してわかるように） */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 my-3">
            <KpiCard
              label="対象サイト（表）"
              value={allText(sitesTable.length, SITE_OPTIONS.length)}
            />
            <KpiCard
              label="職種（大）"
              value={allText(largeTable.length, 19)}
            />
            <KpiCard label="職種（小）" value={smallTable.length || "すべて"} />
            <KpiCard
              label="指標"
              value={metricTable === "jobs" ? "求人数" : "求職者数"}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200">
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
          <JobCategoryModal
            initialLarge={largeChart}
            initialSmall={smallChart}
            onCloseAction={() => setOpenChartCat(false)}
            onApplyAction={(L, S) => {
              setLargeChart(L);
              setSmallChart(S);
              setOpenChartCat(false);
            }}
          />
        )}
        {/* 職種モーダル（表用） */}
        {openTableCat && (
          <JobCategoryModal
            initialLarge={largeTable}
            initialSmall={smallTable}
            onCloseAction={() => setOpenTableCat(false)}
            onApplyAction={(L, S) => {
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

function RowTag({
  label,
  values,
  setValues,
  options,
}: {
  label: string;
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
    <div className="mb-2">
      <div className="mb-1 text-xs font-medium text-neutral-600">{label}</div>
      <div className="flex flex-wrap items-center">
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
      </div>
    </div>
  );
}
