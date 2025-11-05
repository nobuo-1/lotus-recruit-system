// web/src/app/job-boards/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import KpiCard from "@/components/KpiCard";
import Link from "next/link";
import dynamic from "next/dynamic";
import { JOB_LARGE } from "@/constants/jobCategories";

// Recharts（SSR回避）
const ResponsiveContainer = dynamic(
  async () => (await import("recharts")).ResponsiveContainer,
  { ssr: false }
);
const LineChart = dynamic(async () => (await import("recharts")).LineChart, {
  ssr: false,
});
const Line = dynamic(async () => (await import("recharts")).Line, {
  ssr: false,
});
const XAxis = dynamic(async () => (await import("recharts")).XAxis, {
  ssr: false,
});
const YAxis = dynamic(async () => (await import("recharts")).YAxis, {
  ssr: false,
});
const Tooltip = dynamic(async () => (await import("recharts")).Tooltip, {
  ssr: false,
});
const CartesianGrid = dynamic(
  async () => (await import("recharts")).CartesianGrid,
  { ssr: false }
);
const Legend = dynamic(
  () =>
    import("recharts").then(
      (m) => m.Legend as unknown as React.ComponentType<any>
    ),
  { ssr: false }
);

// 職種モーダル
const JobCategoryModal = dynamic(
  () => import("@/components/job-boards/JobCategoryModal"),
  { ssr: false }
);

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

// サイトごとの固定カラー
const SITE_COLOR: Record<string, string> = {
  doda: "#3B82F6",
  mynavi: "#10B981",
  type: "#F59E0B",
  womantype: "#8B5CF6",
};

type ApiRow = {
  week_start?: string | null;
  month_start?: string | null;
  site_key: string;
  large_category: string | null;
  small_category: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture?: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

type SeriesPoint = { date: string; [site: string]: number | string };

function labelOfMode(mode: Mode) {
  return mode === "weekly" ? "週次" : "月次（各月の最新）";
}
function allLabel(count: number, total: number) {
  return count === total ? `${total}(ALL)` : String(count);
}

export default function JobBoardsPage() {
  // ===== グラフ側フィルタ =====
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
  const [prefChart, setPrefChart] = useState<string[]>([]);
  const [showChartFilters, setShowChartFilters] = useState(true);

  // ===== 表側フィルタ =====
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
  const [prefTable, setPrefTable] = useState<string[]>([]);
  const [showTableFilters, setShowTableFilters] = useState(true);

  // 任意期間（表のみ）
  const [tableFrom, setTableFrom] = useState<string>("");
  const [tableTo, setTableTo] = useState<string>("");

  // ===== データ =====
  const [rowsChart, setRowsChart] = useState<ApiRow[]>([]);
  const [rowsTable, setRowsTable] = useState<ApiRow[]>([]);
  const [msgChart, setMsgChart] = useState("");
  const [msgTable, setMsgTable] = useState("");

  // API: グラフ
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
            pref: prefChart, // ★ 追加
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
    prefChart.join(","), // ★ 追加
  ]);

  // API: 表
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
            pref: prefTable, // ★ 追加
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
    prefTable.join(","), // ★ 追加
  ]);

  // 折れ線グラフシリーズ
  const dateKeyChart = modeChart === "weekly" ? "week_start" : "month_start";
  const seriesChart: SeriesPoint[] = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {};
    const metricKey =
      metricChart === "jobs" ? "jobs_count" : "candidates_count";
    for (const r of rowsChart) {
      const d = (r as any)[dateKeyChart];
      if (!d) continue;
      const key = r.site_key;
      const val = Number((r as any)[metricKey] ?? 0);
      if (!byDate[d]) byDate[d] = {};
      byDate[d][key] = (byDate[d][key] ?? 0) + (Number.isFinite(val) ? val : 0);
    }
    const dates = Object.keys(byDate).sort();
    return dates.map((d) => {
      const row: SeriesPoint = { date: d };
      for (const s of SITE_OPTIONS.map((x) => x.value))
        row[s] = byDate[d][s] ?? 0;
      return row;
    });
  }, [rowsChart, dateKeyChart, metricChart]);

  // 表（サイト合計）— 任意期間でクライアント絞り込み
  const dateKeyTable = modeTable === "weekly" ? "week_start" : "month_start";
  const tableAgg = useMemo(() => {
    const metricKey =
      metricTable === "jobs" ? "jobs_count" : "candidates_count";
    const fromD = tableFrom ? new Date(tableFrom) : null;
    const toD = tableTo ? new Date(tableTo) : null;

    const bySite: Record<string, number> = {};
    for (const r of rowsTable) {
      const dStr = (r as any)[dateKeyTable] as string | null | undefined;
      if (dStr) {
        const d = new Date(dStr);
        if (fromD && d < fromD) continue;
        if (toD && d > toD) continue;
      }
      // 都道府県フィルタ（表側）
      if (prefTable.length) {
        const p = (r.prefecture || "").trim();
        if (!p || !prefTable.includes(p)) continue;
      }
      const key = r.site_key;
      const val = Number((r as any)[metricKey] ?? 0);
      bySite[key] = (bySite[key] ?? 0) + (Number.isFinite(val) ? val : 0);
    }
    return SITE_OPTIONS.filter((s) => sitesTable.includes(s.value))
      .map((s) => ({
        site: s.label,
        key: s.value,
        total: bySite[s.value] ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [
    rowsTable,
    metricTable,
    sitesTable,
    tableFrom,
    tableTo,
    dateKeyTable,
    prefTable,
  ]);

  // モーダル制御
  const [openChartCat, setOpenChartCat] = useState(false);
  const [openTableCat, setOpenTableCat] = useState(false);

  // UIパーツ：Chip
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
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      } mr-2 mb-2`}
    >
      {label}
    </button>
  );

  // 共通タグ選択
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
    return (
      <div className="flex flex-wrap">
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
    );
  }

  // 都道府県
  const PREFS = [
    "北海道",
    "青森県",
    "岩手県",
    "宮城県",
    "秋田県",
    "山形県",
    "福島県",
    "茨城県",
    "栃木県",
    "群馬県",
    "埼玉県",
    "千葉県",
    "東京都",
    "神奈川県",
    "新潟県",
    "富山県",
    "石川県",
    "福井県",
    "山梨県",
    "長野県",
    "岐阜県",
    "静岡県",
    "愛知県",
    "三重県",
    "滋賀県",
    "京都府",
    "大阪府",
    "兵庫県",
    "奈良県",
    "和歌山県",
    "鳥取県",
    "島根県",
    "岡山県",
    "広島県",
    "山口県",
    "徳島県",
    "香川県",
    "愛媛県",
    "高知県",
    "福岡県",
    "佐賀県",
    "長崎県",
    "熊本県",
    "大分県",
    "宮崎県",
    "鹿児島県",
    "沖縄県",
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
          <p className="mt-1 text-sm text-neutral-500">
            サイト別の求人数／求職者数のトレンド（週次・月次）
          </p>
        </div>

        {/* 機能メニュー（フォーム営業トップ風） */}
        <header className="mb-3">
          <h2 className="text-2xl md:text-[24px] font-semibold text-neutral-900">
            機能メニュー
          </h2>
        </header>
        <div className="mb-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
            {/* 実行 */}
            <section>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                実行
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/job-boards/manual"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    手動実行（件数取得）
                  </Link>
                </li>
                <li>
                  <Link
                    href="/job-boards/runs"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    実行状況
                  </Link>
                </li>
              </ul>
            </section>
            {/* リスト/宛先 */}
            <section>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                リスト
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/job-boards/destinations"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    送り先一覧
                  </Link>
                </li>
              </ul>
            </section>
            {/* 設定 */}
            <section>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                設定
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/job-boards/settings"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    通知設定
                  </Link>
                </li>
                <li>
                  <Link
                    href="/job-boards/logins"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    ログイン情報の登録
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* ====== KPI＋折れ線グラフ ====== */}
        <section className="rounded-2xl border border-neutral-200 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-3">
            <KpiCard
              label="対象サイト"
              value={allLabel(sitesChart.length, SITE_OPTIONS.length)}
            />
            <KpiCard
              label="職種（大）"
              value={allLabel(largeChart.length || 0, JOB_LARGE.length)}
            />
            <KpiCard
              label="職種（小）"
              value={smallChart.length ? String(smallChart.length) : "すべて"}
            />
            <KpiCard label="ビュー" value={labelOfMode(modeChart)} />
          </div>

          {/* トグル */}
          <div className="mb-2">
            <button
              className="text-xs rounded-lg border border-neutral-300 px-2 py-1 hover:bg-neutral-50"
              onClick={() => setShowChartFilters((v) => !v)}
            >
              {showChartFilters ? "フィルタを隠す" : "フィルタを表示"}
            </button>
          </div>

          {showChartFilters && (
            <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50/40">
              <div className="mb-2 flex flex-wrap items-center">
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

              {/* サイト */}
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  サイト
                </div>
                <div className="flex flex-wrap">
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

              {/* 職種モーダル */}
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

              {/* 年齢/雇用/年収 */}
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  年齢層
                </div>
                <TagMulti
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
              </div>
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  雇用形態
                </div>
                <TagMulti
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
              </div>
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  年収帯
                </div>
                <TagMulti
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

              {/* 都道府県（★追加） */}
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  都道府県
                </div>
                <TagMulti
                  values={prefChart}
                  setValues={setPrefChart}
                  options={PREFS}
                />
              </div>
            </div>
          )}

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
                      stroke={SITE_COLOR[s.value] || "#64748B"}
                      connectNulls
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

        {/* ====== サイト別合計（表） ====== */}
        <section className="mt-6 rounded-2xl border border-neutral-200 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-3">
            <KpiCard
              label="対象サイト（表）"
              value={allLabel(sitesTable.length, SITE_OPTIONS.length)}
            />
            <KpiCard
              label="職種（大・表）"
              value={allLabel(largeTable.length || 0, JOB_LARGE.length)}
            />
            <KpiCard
              label="職種（小・表）"
              value={smallTable.length ? String(smallTable.length) : "すべて"}
            />
            <KpiCard label="ビュー（表）" value={labelOfMode(modeTable)} />
          </div>

          {/* トグル＋任意期間＋都道府県（追加） */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              className="text-xs rounded-lg border border-neutral-300 px-2 py-1 hover:bg-neutral-50"
              onClick={() => setShowTableFilters((v) => !v)}
            >
              {showTableFilters ? "フィルタを隠す" : "フィルタを表示"}
            </button>

            {/* 任意期間 */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-600">期間:</span>
              <input
                type="date"
                value={tableFrom}
                onChange={(e) => setTableFrom(e.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1"
              />
              <span>〜</span>
              <input
                type="date"
                value={tableTo}
                onChange={(e) => setTableTo(e.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1"
              />
              {tableFrom || tableTo ? (
                <button
                  className="rounded-md border border-neutral-300 px-2 py-1"
                  onClick={() => {
                    setTableFrom("");
                    setTableTo("");
                  }}
                >
                  クリア
                </button>
              ) : null}
            </div>

            {/* 都道府県（表側） */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-600">都道府県:</span>
              <select
                multiple
                value={prefTable}
                onChange={(e) =>
                  setPrefTable(
                    Array.from(e.target.selectedOptions).map((o) => o.value)
                  )
                }
                className="rounded-md border border-neutral-300 px-2 py-1"
              >
                {PREFS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {prefTable.length ? (
                <button
                  className="rounded-md border border-neutral-300 px-2 py-1"
                  onClick={() => setPrefTable([])}
                >
                  解除
                </button>
              ) : null}
            </div>
          </div>

          {showTableFilters && (
            <>
              <div className="mb-2 flex flex-wrap items-center">
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

              <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50/40">
                {/* サイト */}
                <div className="mb-2">
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    サイト
                  </div>
                  <div className="flex flex-wrap">
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

                {/* 職種（モーダル） */}
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

                {/* 年齢層・雇用・年収 */}
                <div className="mb-2">
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    年齢層
                  </div>
                  <TagMulti
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
                </div>
                <div className="mb-2">
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    雇用形態
                  </div>
                  <TagMulti
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
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    年収帯
                  </div>
                  <TagMulti
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

                {/* 都道府県 */}
                <div className="mt-2">
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    都道府県
                  </div>
                  <TagMulti
                    values={prefTable}
                    setValues={setPrefTable}
                    options={PREFS}
                  />
                </div>
              </div>
            </>
          )}

          {/* 表 */}
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
          <JobCategoryModal
            large={largeChart}
            small={smallChart}
            onCloseAction={() => setOpenChartCat(false)}
            onApplyAction={(L: string[], S: string[]) => {
              setLargeChart(L);
              setSmallChart(S);
              setOpenChartCat(false);
            }}
          />
        )}
        {/* 職種モーダル（表用） */}
        {openTableCat && (
          <JobCategoryModal
            large={largeTable}
            small={smallTable}
            onCloseAction={() => setOpenTableCat(false)}
            onApplyAction={(L: string[], S: string[]) => {
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
