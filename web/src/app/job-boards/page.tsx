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
  // グラフフィルタ
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

  // 表フィルタ
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

  // データ
  const [rowsChart, setRowsChart] = useState<ApiRow[]>([]);
  const [rowsTable, setRowsTable] = useState<ApiRow[]>([]);
  const [msgChart, setMsgChart] = useState("");
  const [msgTable, setMsgTable] = useState("");

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
    sitesChart.join(","),
    largeChart.join(","),
    smallChart.join(","),
    ageChart.join(","),
    empChart.join(","),
    salChart.join(","),
    rangeChart,
  ]);

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
    sitesTable.join(","),
    largeTable.join(","),
    smallTable.join(","),
    ageTable.join(","),
    empTable.join(","),
    salTable.join(","),
    rangeTable,
  ]);

  // 小分類候補（選択大分類から絞込み）
  const smallOptionsChart = useMemo(() => {
    const set = new Set<string>();
    (largeChart.length ? largeChart : JOB_LARGE).forEach((l) => {
      (JOB_CATEGORIES[l] || []).forEach((s) => set.add(s));
    });
    return Array.from(set);
  }, [largeChart]);

  const smallOptionsTable = useMemo(() => {
    const set = new Set<string>();
    (largeTable.length ? largeTable : JOB_LARGE).forEach((l) => {
      (JOB_CATEGORIES[l] || []).forEach((s) => set.add(s));
    });
    return Array.from(set);
  }, [largeTable]);

  // 折れ線データ
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

  // サイト別合計表
  const tableAgg = useMemo(() => {
    const metricKey =
      metricTable === "jobs" ? "jobs_count" : "candidates_count";
    const bySite: Record<string, number> = {};
    for (const r of rowsTable) {
      const k = r.site_key;
      bySite[k] = (bySite[k] ?? 0) + (r as any)[metricKey];
    }
    return SITE_OPTIONS.filter((s) => sitesTable.includes(s.value))
      .map((s) => ({
        site: s.label,
        key: s.value,
        total: bySite[s.value] ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [rowsTable, sitesTable, metricTable]);

  // 選択ユーティリティ
  const toggle = (arr: string[], setArr: (v: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const selectAll = (vals: string[], setArr: (v: string[]) => void) =>
    setArr(vals);
  const clearAll = (setArr: (v: string[]) => void) => setArr([]);

  // 年齢帯・雇用・年収（選択肢）
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

  // 職種モーダル開閉
  const [openChartCat, setOpenChartCat] = useState(false);
  const [openTableCat, setOpenTableCat] = useState(false);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル＋遷移先 */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[26px] md:text-[24px] font-extrabold tracking-tight text-indigo-900">
              転職サイトリサーチ
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              サイト別の求人数／求職者数のトレンドと比較（週次／月次）
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
          <KpiCard label="対象サイト" value={sitesChart.length} />
          <KpiCard label="職種（大）" value={largeChart.length || "すべて"} />
          <KpiCard label="職種（小）" value={smallChart.length || "すべて"} />
          <KpiCard label="ビュー" value={labelOfMode(modeChart)} />
        </div>

        {/* ====== グラフ ====== */}
        <section className="mt-2 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-semibold text-neutral-800">
              折れ線グラフ（サイト重ね描画）
            </div>
            <div className="flex flex-wrap gap-2">
              {(["weekly", "monthly"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setModeChart(m);
                    setRangeChart(m === "weekly" ? "26w" : "12m");
                  }}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    modeChart === m
                      ? "border border-neutral-400 text-neutral-800"
                      : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {m === "weekly" ? "週次" : "月次"}
                </button>
              ))}
              <div className="inline-flex items-center gap-1">
                {(modeChart === "weekly"
                  ? (["12w", "26w", "52w"] as const)
                  : (["12m", "36m"] as const)
                ).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRangeChart(r)}
                    className={`rounded-lg px-2 py-1 text-xs ${
                      rangeChart === r
                        ? "border border-neutral-400 text-neutral-800"
                        : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {(["jobs", "candidates"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setMetricChart(k)}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    metricChart === k
                      ? "border border-indigo-400 text-indigo-700"
                      : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {k === "jobs" ? "求人数" : "求職者数"}
                </button>
              ))}
            </div>
          </div>

          {/* フィルタ（サイト / 職種モーダル / 年齢 / 雇用 / 年収） */}
          <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50/40">
            <Row label="サイト">
              <button
                className="btn-mini"
                onClick={() =>
                  selectAll(
                    SITE_OPTIONS.map((s) => s.value),
                    setSitesChart
                  )
                }
              >
                すべて
              </button>
              <button
                className="btn-mini"
                onClick={() => clearAll(setSitesChart)}
              >
                解除
              </button>
              {SITE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="inline-flex items-center gap-2 mr-3"
                >
                  <input
                    type="checkbox"
                    checked={sitesChart.includes(opt.value)}
                    onChange={() =>
                      toggle(sitesChart, setSitesChart, opt.value)
                    }
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </Row>
            <Row label="職種">
              <button
                className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                onClick={() => setOpenChartCat(true)}
              >
                選択（{largeChart.length || "すべて"} /{" "}
                {smallChart.length || "すべて"}）
              </button>
            </Row>
            <Row label="年齢層">
              <MultiChips
                values={ageChart}
                setValues={setAgeChart}
                options={AGE_BANDS}
              />
            </Row>
            <Row label="雇用形態">
              <MultiChips
                values={empChart}
                setValues={setEmpChart}
                options={EMP_TYPES}
              />
            </Row>
            <Row label="年収帯">
              <MultiChips
                values={salChart}
                setValues={setSalChart}
                options={SALARY_BAND}
              />
            </Row>
          </div>

          {/* グラフ */}
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

        {/* ====== 表（サイト横比較） ====== */}
        <section className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-semibold text-neutral-800">
              サイト別合計（{labelOfMode(modeTable)}）
            </div>
            <div className="flex flex-wrap gap-2">
              {(["weekly", "monthly"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setModeTable(m);
                    setRangeTable(m === "weekly" ? "26w" : "12m");
                  }}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    modeTable === m
                      ? "border border-neutral-400 text-neutral-800"
                      : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {m === "weekly" ? "週次" : "月次"}
                </button>
              ))}
              <div className="inline-flex items-center gap-1">
                {(modeTable === "weekly"
                  ? (["12w", "26w", "52w"] as const)
                  : (["12m", "36m"] as const)
                ).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRangeTable(r)}
                    className={`rounded-lg px-2 py-1 text-xs ${
                      rangeTable === r
                        ? "border border-neutral-400 text-neutral-800"
                        : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {(["jobs", "candidates"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setMetricTable(k)}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    metricTable === k
                      ? "border border-indigo-400 text-indigo-700"
                      : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {k === "jobs" ? "求人数" : "求職者数"}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50/40">
            <Row label="サイト">
              <button
                className="btn-mini"
                onClick={() =>
                  selectAll(
                    SITE_OPTIONS.map((s) => s.value),
                    setSitesTable
                  )
                }
              >
                すべて
              </button>
              <button
                className="btn-mini"
                onClick={() => clearAll(setSitesTable)}
              >
                解除
              </button>
              {SITE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="inline-flex items-center gap-2 mr-3"
                >
                  <input
                    type="checkbox"
                    checked={sitesTable.includes(opt.value)}
                    onChange={() =>
                      toggle(sitesTable, setSitesTable, opt.value)
                    }
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </Row>
            <Row label="職種">
              <button
                className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                onClick={() => setOpenTableCat(true)}
              >
                選択（{largeTable.length || "すべて"} /{" "}
                {smallTable.length || "すべて"}）
              </button>
            </Row>
            <Row label="年齢層">
              <MultiChips
                values={ageTable}
                setValues={setAgeTable}
                options={AGE_BANDS}
              />
            </Row>
            <Row label="雇用形態">
              <MultiChips
                values={empTable}
                setValues={setEmpTable}
                options={EMP_TYPES}
              />
            </Row>
            <Row label="年収帯">
              <MultiChips
                values={salTable}
                setValues={setSalTable}
                options={SALARY_BAND}
              />
            </Row>
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 mt-3">
            <table className="min-w-[800px] w-full text-sm">
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
                      className="px-3 py-8 text-center text-neutral-400"
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

        {/* 職種ピッカー（グラフ用） */}
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
        {/* 職種ピッカー（表用） */}
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

      <style jsx global>{`
        .btn-mini {
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 8px;
          padding: 2px 8px;
          font-size: 12px;
          color: #555;
        }
        .btn-mini:hover {
          background: #f8f8f8;
        }
      `}</style>
    </>
  );
}

/** 小さなピル型チェック群（全選択/解除ボタン含む） */
function MultiChips({
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
  return (
    <>
      <button className="btn-mini" onClick={() => setValues(options)}>
        すべて
      </button>
      <button className="btn-mini" onClick={() => setValues([])}>
        解除
      </button>
      {options.map((o) => (
        <label key={o} className="inline-flex items-center gap-2 mr-3">
          <input
            type="checkbox"
            checked={values.includes(o)}
            onChange={() => toggle(o)}
          />
          <span>{o}</span>
        </label>
      ))}
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-xs font-medium text-neutral-600">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** 職種ピッカーモーダル（左:大分類 / 右:小分類、画像参考UI） */
function CategoryPicker({
  large,
  small,
  onClose,
  onApply,
}: {
  large: string[];
  small: string[];
  onClose: () => void;
  onApply: (largeSelected: string[], smallSelected: string[]) => void;
}) {
  const [L, setL] = useState<string[]>(large);
  const [S, setS] = useState<string[]>(small);
  const [activeL, setActiveL] = useState<string>(L[0] || JOB_LARGE[0]);

  useEffect(() => {
    if (!L.includes(activeL)) {
      setActiveL(L[0] || JOB_LARGE[0]);
    }
  }, [L, activeL]);

  const toggleL = (v: string) =>
    setL(L.includes(v) ? L.filter((x) => x !== v) : [...L, v]);
  const toggleS = (v: string) =>
    setS(S.includes(v) ? S.filter((x) => x !== v) : [...S, v]);

  const rightList = useMemo(() => {
    const targetLs = L.length ? L : JOB_LARGE;
    const set = new Set<string>();
    targetLs.forEach((l) =>
      (JOB_CATEGORIES[l] || []).forEach((s) => set.add(s))
    );
    return Array.from(set);
  }, [L]);

  const rightOfActive = JOB_CATEGORIES[activeL] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[960px] max-w-[96vw] rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">職種選択</div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 border hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>
        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={L.length === JOB_LARGE.length}
                onChange={(e) => setL(e.target.checked ? [...JOB_LARGE] : [])}
              />
              <span>大分類 すべて選択</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={S.length === rightList.length && rightList.length > 0}
                onChange={(e) => setS(e.target.checked ? [...rightList] : [])}
              />
              <span>小分類 すべて選択（現在の対象）</span>
            </label>
          </div>

          <div className="grid grid-cols-12 gap-4">
            {/* 左：大分類 */}
            <div className="col-span-4">
              <div className="rounded-xl border">
                {JOB_LARGE.map((l) => {
                  const active = activeL === l;
                  return (
                    <div
                      key={l}
                      className={`flex items-center justify-between px-3 py-2 border-b last:border-b-0 ${
                        active ? "bg-neutral-50" : ""
                      }`}
                    >
                      <button
                        className="text-left text-sm font-medium"
                        onClick={() => setActiveL(l)}
                      >
                        {l}
                      </button>
                      <input
                        type="checkbox"
                        checked={L.includes(l)}
                        onChange={() => toggleL(l)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右：小分類（アクティブ大分類） */}
            <div className="col-span-8">
              <div className="mb-2 text-sm font-semibold text-neutral-800">
                {activeL}
              </div>
              <div className="rounded-xl border p-3 max-h-[420px] overflow-auto">
                <div className="grid grid-cols-2 gap-2">
                  {rightOfActive.map((s) => (
                    <label key={s} className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={S.includes(s)}
                        onChange={() => toggleS(s)}
                      />
                      <span className="text-sm">{s}</span>
                    </label>
                  ))}
                  {rightOfActive.length === 0 && (
                    <div className="text-neutral-400 text-sm">
                      小分類はありません
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                ※大分類の選択は「対象とする小分類の集合」を決めるために使います。
              </div>
            </div>
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
