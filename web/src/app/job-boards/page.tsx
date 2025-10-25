// web/src/app/job-boards/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import KpiCard from "@/components/KpiCard";
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
  // ---------- フィルタ（グラフ用 / 表用を独立して保持） ----------
  const [modeChart, setModeChart] = useState<Mode>("weekly");
  const [rangeChart, setRangeChart] = useState<RangeW | RangeM>("26w");
  const [metricChart, setMetricChart] = useState<Metric>("jobs");
  const [sitesChart, setSitesChart] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  ); // 初期: 全部
  const [largeChart, setLargeChart] = useState<string[]>([]);
  const [smallChart, setSmallChart] = useState<string[]>([]);
  const [ageChart, setAgeChart] = useState<string[]>([]);
  const [empChart, setEmpChart] = useState<string[]>([]);
  const [salChart, setSalChart] = useState<string[]>([]);

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

  // ---------- データ ----------
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

  // ---------- 職種（大→小） ----------
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

  // ---------- 折れ線データ構築（サイトごと重ね描画） ----------
  const dateKeyChart = modeChart === "weekly" ? "week_start" : "month_start";
  const seriesChart: SeriesPoint[] = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {};
    const metricKey =
      metricChart === "jobs" ? "jobs_count" : "candidates_count";
    for (const r of rowsChart) {
      const d = (r as any)[dateKeyChart];
      if (!d) continue;
      byDate[d] ||= {};
      const cur = byDate[d];
      const k = r.site_key;
      cur[k] = (cur[k] ?? 0) + (r as any)[metricKey];
    }
    const dates = Object.keys(byDate).sort();
    return dates.map((d) => {
      const base: SeriesPoint = { date: d };
      for (const s of SITE_OPTIONS.map((x) => x.value)) {
        base[s] = byDate[d][s] ?? 0;
      }
      return base;
    });
  }, [rowsChart, dateKeyChart, metricChart]);

  // ---------- 表データ（サイト横並び比較） ----------
  const tableAgg = useMemo(() => {
    const metricKey =
      metricTable === "jobs" ? "jobs_count" : "candidates_count";
    const bySite: Record<string, number> = {};
    for (const r of rowsTable) {
      const k = r.site_key;
      bySite[k] = (bySite[k] ?? 0) + (r as any)[metricKey];
    }
    const rows = SITE_OPTIONS.filter((s) => sitesTable.includes(s.value))
      .map((s) => ({
        site: s.label,
        key: s.value,
        total: bySite[s.value] ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
    return rows;
  }, [rowsTable, sitesTable, metricTable]);

  // ---------- 選択ユーティリティ ----------
  const toggle = (arr: string[], setArr: (v: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const selectAll = (vals: string[], setArr: (v: string[]) => void) =>
    setArr(vals);
  const clearAll = (setArr: (v: string[]) => void) => setArr([]);

  // 年齢帯・雇用・年収の候補（必要に応じて DB 側で distinct を持ってもOK）
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
        {/* タイトル */}
        <div className="mb-4">
          <h1 className="text-[26px] md:text-[24px] font-extrabold tracking-tight text-indigo-900">
            転職サイトリサーチ
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            サイト別の求人数／求職者数のトレンドと比較（週次／月次）
          </p>
        </div>

        {/* KPI（ダミーでもOK。将来ここに速報KPIを置く想定） */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
          <KpiCard label="対象サイト" value={sitesChart.length} />
          <KpiCard label="職種（大）" value={largeChart.length || "すべて"} />
          <KpiCard label="職種（小）" value={smallChart.length || "すべて"} />
          <KpiCard label="ビュー" value={labelOfMode(modeChart)} />
        </div>

        {/* ====== グラフブロック ====== */}
        <section className="mt-2 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-semibold text-neutral-800">
              折れ線グラフ（サイト別重ね描画）
            </div>
            <div className="flex flex-wrap gap-2">
              {/* 週次/月次 */}
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
              {/* 期間 */}
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
              {/* 指標 */}
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

          {/* フィルタ（サイト / 職種 / 年齢 / 雇用 / 年収） */}
          <FiltersBlock
            title="グラフフィルタ"
            sites={sitesChart}
            setSites={setSitesChart}
            large={largeChart}
            setLarge={setLargeChart}
            small={smallChart}
            setSmall={setSmallChart}
            smallOptions={smallOptionsChart}
            age={ageChart}
            setAge={setAgeChart}
            emp={empChart}
            setEmp={setEmpChart}
            sal={salChart}
            setSal={setSalChart}
          />

          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {SITE_OPTIONS.filter((s) => sitesChart.includes(s.value)).map(
                  (s, idx) => (
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

        {/* ====== 表ブロック（サイト横比較） ====== */}
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

          <FiltersBlock
            title="表フィルタ"
            sites={sitesTable}
            setSites={setSitesTable}
            large={largeTable}
            setLarge={setLargeTable}
            small={smallTable}
            setSmall={setSmallTable}
            smallOptions={smallOptionsTable}
            age={ageTable}
            setAge={setAgeTable}
            emp={empTable}
            setEmp={setEmpTable}
            sal={salTable}
            setSal={setSalTable}
          />

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
      </main>
    </>
  );
}

function FiltersBlock(props: {
  title: string;
  sites: string[];
  setSites: (v: string[]) => void;
  large: string[];
  setLarge: (v: string[]) => void;
  small: string[];
  setSmall: (v: string[]) => void;
  smallOptions: string[];
  age: string[];
  setAge: (v: string[]) => void;
  emp: string[];
  setEmp: (v: string[]) => void;
  sal: string[];
  setSal: (v: string[]) => void;
}) {
  const {
    title,
    sites,
    setSites,
    large,
    setLarge,
    small,
    setSmall,
    smallOptions,
    age,
    setAge,
    emp,
    setEmp,
    sal,
    setSal,
  } = props;

  const toggle = (arr: string[], setArr: (v: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const selectAll = (vals: string[], setArr: (v: string[]) => void) =>
    setArr(vals);
  const clearAll = (setArr: (v: string[]) => void) => setArr([]);

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
    <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50/40">
      <div className="mb-2 text-sm font-semibold text-neutral-800">{title}</div>

      {/* サイト */}
      <Row label="サイト">
        <button
          className="btn-mini"
          onClick={() =>
            selectAll(
              SITE_OPTIONS.map((s) => s.value),
              setSites
            )
          }
        >
          すべて
        </button>
        <button className="btn-mini" onClick={() => clearAll(setSites)}>
          解除
        </button>
        {SITE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="inline-flex items-center gap-2 mr-3"
          >
            <input
              type="checkbox"
              checked={sites.includes(opt.value)}
              onChange={() => toggle(sites, setSites, opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </Row>

      {/* 職種（大） */}
      <Row label="職種（大）">
        <button
          className="btn-mini"
          onClick={() => selectAll(JOB_LARGE, setLarge)}
        >
          すべて
        </button>
        <button className="btn-mini" onClick={() => clearAll(setLarge)}>
          解除
        </button>
        {JOB_LARGE.map((l) => (
          <label key={l} className="inline-flex items-center gap-2 mr-3">
            <input
              type="checkbox"
              checked={large.includes(l)}
              onChange={() => toggle(large, setLarge, l)}
            />
            <span>{l}</span>
          </label>
        ))}
      </Row>

      {/* 職種（小） */}
      <Row label="職種（小）">
        <button
          className="btn-mini"
          onClick={() => selectAll(smallOptions, setSmall)}
        >
          すべて
        </button>
        <button className="btn-mini" onClick={() => clearAll(setSmall)}>
          解除
        </button>
        {smallOptions.map((s) => (
          <label key={s} className="inline-flex items-center gap-2 mr-3">
            <input
              type="checkbox"
              checked={small.includes(s)}
              onChange={() => toggle(small, setSmall, s)}
            />
            <span>{s}</span>
          </label>
        ))}
      </Row>

      {/* 年齢層 */}
      <Row label="年齢層">
        <button
          className="btn-mini"
          onClick={() => selectAll(AGE_BANDS, setAge)}
        >
          すべて
        </button>
        <button className="btn-mini" onClick={() => clearAll(setAge)}>
          解除
        </button>
        {AGE_BANDS.map((a) => (
          <label key={a} className="inline-flex items-center gap-2 mr-3">
            <input
              type="checkbox"
              checked={age.includes(a)}
              onChange={() => toggle(age, setAge, a)}
            />
            <span>{a}</span>
          </label>
        ))}
      </Row>

      {/* 雇用形態 */}
      <Row label="雇用形態">
        <button
          className="btn-mini"
          onClick={() => selectAll(EMP_TYPES, setEmp)}
        >
          すべて
        </button>
        <button className="btn-mini" onClick={() => clearAll(setEmp)}>
          解除
        </button>
        {EMP_TYPES.map((e) => (
          <label key={e} className="inline-flex items-center gap-2 mr-3">
            <input
              type="checkbox"
              checked={emp.includes(e)}
              onChange={() => toggle(emp, setEmp, e)}
            />
            <span>{e}</span>
          </label>
        ))}
      </Row>

      {/* 年収帯 */}
      <Row label="年収帯">
        <button
          className="btn-mini"
          onClick={() => selectAll(SALARY_BAND, setSal)}
        >
          すべて
        </button>
        <button className="btn-mini" onClick={() => clearAll(setSal)}>
          解除
        </button>
        {SALARY_BAND.map((s) => (
          <label key={s} className="inline-flex items-center gap-2 mr-3">
            <input
              type="checkbox"
              checked={sal.includes(s)}
              onChange={() => toggle(sal, setSal, s)}
            />
            <span>{s}</span>
          </label>
        ))}
      </Row>
    </div>
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
      <style jsx>{`
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
    </div>
  );
}
