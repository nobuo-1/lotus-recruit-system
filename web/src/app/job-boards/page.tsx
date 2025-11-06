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

// 職種モーダル（バグ修正版）
const JobCategoryModal = dynamic(
  () => import("@/components/job-boards/JobCategoryModal"),
  { ssr: false }
);

/** =========================
 * 都道府県モーダル（Filters画面と同UI）
 * ========================= */
const PREF_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "北海道・東北",
    items: [
      "北海道",
      "青森県",
      "岩手県",
      "宮城県",
      "秋田県",
      "山形県",
      "福島県",
    ],
  },
  {
    label: "関東",
    items: [
      "茨城県",
      "栃木県",
      "群馬県",
      "埼玉県",
      "千葉県",
      "東京都",
      "神奈川県",
    ],
  },
  {
    label: "中部",
    items: [
      "新潟県",
      "富山県",
      "石川県",
      "福井県",
      "山梨県",
      "長野県",
      "岐阜県",
      "静岡県",
      "愛知県",
    ],
  },
  {
    label: "近畿",
    items: [
      "三重県",
      "滋賀県",
      "京都府",
      "大阪府",
      "兵庫県",
      "奈良県",
      "和歌山県",
    ],
  },
  { label: "中国", items: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"] },
  { label: "四国", items: ["徳島県", "香川県", "愛媛県", "高知県"] },
  {
    label: "九州・沖縄",
    items: [
      "福岡県",
      "佐賀県",
      "長崎県",
      "熊本県",
      "大分県",
      "宮崎県",
      "鹿児島県",
      "沖縄県",
    ],
  },
];

function PrefectureModal({
  selected,
  onCloseAction,
  onApplyAction,
}: {
  selected: string[];
  onCloseAction: () => void;
  onApplyAction: (pref: string[]) => void;
}) {
  const [pref, setPref] = useState<string[]>(selected ?? []);
  const [query, setQuery] = useState("");
  useEffect(() => setPref(selected ?? []), [selected]);
  const all = useMemo(() => PREF_GROUPS.flatMap((g) => g.items), []);
  const nationalAll = pref.length === all.length;

  const filteredGroups = useMemo(() => {
    const q = query.trim();
    if (!q) return PREF_GROUPS;
    return PREF_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((x) => x.includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const toggleNational = (checked: boolean) => {
    setPref(checked ? [...all] : []);
  };
  const regionAllChecked = (items: string[]) =>
    items.every((x) => pref.includes(x)) && items.length > 0;
  const toggleRegionAll = (items: string[], checked: boolean) => {
    if (checked) setPref(Array.from(new Set([...pref, ...items])));
    else setPref(pref.filter((x) => !items.includes(x)));
  };
  const toggleOne = (name: string, checked: boolean) => {
    setPref((p) =>
      checked ? Array.from(new Set([...p, name])) : p.filter((x) => x !== name)
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[980px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="font-semibold">都道府県選択</div>
          <button
            onClick={onCloseAction}
            className="rounded-lg px-2 py-1 border border-neutral-300 hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm inline-flex items-center">
              <input
                type="checkbox"
                className="mr-2"
                checked={nationalAll}
                onChange={(e) => toggleNational(e.target.checked)}
              />
              全国 すべて選択
            </label>
            <input
              className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="検索（例: 大阪、東）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="max-h-[520px] overflow-auto space-y-3">
            {filteredGroups.map((g) => {
              const regionAll = regionAllChecked(g.items);
              return (
                <div
                  key={g.label}
                  className="rounded-xl border border-neutral-200 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-neutral-700">
                      {g.label}
                    </div>
                    <label className="text-xs inline-flex items-center">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={regionAll}
                        onChange={(e) =>
                          toggleRegionAll(g.items, e.target.checked)
                        }
                      />
                      この地方をすべて選択/解除
                    </label>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2 text-sm">
                    {g.items.map((name) => {
                      const checked = pref.includes(name);
                      return (
                        <label
                          key={name}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                            checked
                              ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                              : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleOne(name, e.target.checked)}
                          />
                          {name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {filteredGroups.length === 0 && (
              <div className="text-xs text-neutral-400">
                該当する都道府県がありません
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200">
          <button
            onClick={() => setPref([])}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            クリア
          </button>
          <button
            onClick={() => onApplyAction(pref)}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            適用して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

/** =========================
 * ページ本体
 * ========================= */

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
  const [openChartCat, setOpenChartCat] = useState(false);
  const [openChartPref, setOpenChartPref] = useState(false);

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
  const [openTableCat, setOpenTableCat] = useState(false);
  const [openTablePref, setOpenTablePref] = useState(false);

  // ===== データ =====
  const [rowsChart, setRowsChart] = useState<ApiRow[]>([]);
  const [rowsTable, setRowsTable] = useState<ApiRow[]>([]);
  const [msgChart, setMsgChart] = useState("");
  const [msgTable, setMsgTable] = useState("");

  // 共通Chip
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

  // API フェッチ（グラフ）
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
            pref: prefChart,
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
    prefChart.join(","),
  ]);

  // API フェッチ（表）
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
            pref: prefTable,
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
    prefTable.join(","),
  ]);

  // 折れ線グラフ用シリーズ
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

  // 表（サイト合計）— 任意期間はこのページではカット（既存の期間UIがないため）

  // マスタ
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

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル＋メニュー */}
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
              href="/job-boards/destinations"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              送り先一覧
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
            <Link
              href="/job-boards/history"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              手動実行履歴
            </Link>
          </div>
        </div>

        {/* ====== KPI＋折れ線グラフ ====== */}
        <section className="rounded-2xl border border-neutral-200 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5 mb-3">
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
            <KpiCard
              label="都道府県"
              value={prefChart.length ? String(prefChart.length) : "全国"}
            />
            <KpiCard label="ビュー" value={labelOfMode(modeChart)} />
          </div>

          {/* フィルタのトグル */}
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

              {/* 職種（モーダル） */}
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

              {/* 都道府県（モーダル） */}
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  都道府県
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                    onClick={() => setOpenChartPref(true)}
                  >
                    選択（{prefChart.length ? `${prefChart.length}件` : "全国"}
                    ）
                  </button>
                  {prefChart.length > 0 && (
                    <button
                      className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                      onClick={() => setPrefChart([])}
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>

              {/* 年齢層 / 雇用形態 / 年収帯（バッチ操作可） */}
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  年齢層
                </div>
                <TagMulti
                  values={ageChart}
                  setValues={setAgeChart}
                  options={AGE_BANDS}
                />
              </div>
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  雇用形態
                </div>
                <TagMulti
                  values={empChart}
                  setValues={setEmpChart}
                  options={EMP_TYPES}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  年収帯
                </div>
                <TagMulti
                  values={salChart}
                  setValues={setSalChart}
                  options={SALARY_BAND}
                />
              </div>
            </div>
          )}

          {/* 折れ線グラフ */}
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
          {/* 表用 KPI */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5 mb-3">
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
            <KpiCard
              label="都道府県（表）"
              value={prefTable.length ? String(prefTable.length) : "全国"}
            />
            <KpiCard label="ビュー（表）" value={labelOfMode(modeTable)} />
          </div>

          {/* フィルタのトグル */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              className="text-xs rounded-lg border border-neutral-300 px-2 py-1 hover:bg-neutral-50"
              onClick={() => setShowTableFilters((v) => !v)}
            >
              {showTableFilters ? "フィルタを隠す" : "フィルタを表示"}
            </button>
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

                {/* 都道府県（モーダル） */}
                <div className="mb-2">
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    都道府県
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                      onClick={() => setOpenTablePref(true)}
                    >
                      選択（
                      {prefTable.length ? `${prefTable.length}件` : "全国"}）
                    </button>
                    {prefTable.length > 0 && (
                      <button
                        className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                        onClick={() => setPrefTable([])}
                      >
                        クリア
                      </button>
                    )}
                  </div>
                </div>

                {/* 年齢層など */}
                <div className="mb-2">
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    年齢層
                  </div>
                  <TagMulti
                    values={ageTable}
                    setValues={setAgeTable}
                    options={AGE_BANDS}
                  />
                </div>
                <div className="mb-2">
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    雇用形態
                  </div>
                  <TagMulti
                    values={empTable}
                    setValues={setEmpTable}
                    options={EMP_TYPES}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    年収帯
                  </div>
                  <TagMulti
                    values={salTable}
                    setValues={setSalTable}
                    options={SALARY_BAND}
                  />
                </div>
              </div>
            </>
          )}

          {/* 表（サイト別合計） */}
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
                {(() => {
                  const metricKey =
                    metricTable === "jobs" ? "jobs_count" : "candidates_count";
                  const bySite: Record<string, number> = {};
                  for (const r of rowsTable) {
                    const key = r.site_key;
                    const val = Number((r as any)[metricKey] ?? 0);
                    bySite[key] =
                      (bySite[key] ?? 0) + (Number.isFinite(val) ? val : 0);
                  }
                  const sorted = SITE_OPTIONS.filter((s) =>
                    sitesTable.includes(s.value)
                  )
                    .map((s) => ({
                      site: s.label,
                      key: s.value,
                      total: bySite[s.value] ?? 0,
                    }))
                    .sort((a, b) => b.total - a.total);

                  if (sorted.length === 0) {
                    return (
                      <tr>
                        <td
                          colSpan={2}
                          className="px-4 py-8 text-center text-neutral-400"
                        >
                          データがありません
                        </td>
                      </tr>
                    );
                  }
                  return sorted.map((r) => (
                    <tr key={r.key} className="border-t border-neutral-200">
                      <td className="px-3 py-3">{r.site}</td>
                      <td className="px-3 py-3">{r.total}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
          {msgTable && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
              {msgTable}
            </pre>
          )}
        </section>

        {/* モーダル */}
        {openChartCat && (
          <JobCategoryModal
            large={largeChart}
            small={smallChart}
            onCloseAction={() => setOpenChartCat(false)}
            onApplyAction={(L, S) => {
              setLargeChart(L);
              setSmallChart(S);
              setOpenChartCat(false);
            }}
          />
        )}
        {openTableCat && (
          <JobCategoryModal
            large={largeTable}
            small={smallTable}
            onCloseAction={() => setOpenTableCat(false)}
            onApplyAction={(L, S) => {
              setLargeTable(L);
              setSmallTable(S);
              setOpenTableCat(false);
            }}
          />
        )}
        {openChartPref && (
          <PrefectureModal
            selected={prefChart}
            onCloseAction={() => setOpenChartPref(false)}
            onApplyAction={(pref) => {
              setPrefChart(pref);
              setOpenChartPref(false);
            }}
          />
        )}
        {openTablePref && (
          <PrefectureModal
            selected={prefTable}
            onCloseAction={() => setOpenTablePref(false)}
            onApplyAction={(pref) => {
              setPrefTable(pref);
              setOpenTablePref(false);
            }}
          />
        )}
      </main>
    </>
  );
}
