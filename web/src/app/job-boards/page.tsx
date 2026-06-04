// web/src/app/job-boards/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import KpiCard from "@/components/KpiCard";
import dynamic from "next/dynamic";
import { JOB_LARGE } from "@/constants/jobCategories";
import {
  ActionGrid,
  PageHero,
  PageMain,
  SectionTitle,
  SurfaceCard,
} from "@/components/PageChrome";
import {
  ChartSpline,
  FileClock,
  FileCog,
  MapPinned,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";

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

// 職種モーダル（合成キー対応版）
const JobCategoryModal = dynamic(
  () => import("@/components/job-boards/JobCategoryModal"),
  { ssr: false }
);

// ====== 小分類の合成キー変換ヘルパ ======
const SEP = ":::";
const decodeSmallKeysToNames = (keys: string[]) =>
  Array.from(
    new Set(
      keys.map((k) => (k.includes(SEP) ? k.split(SEP)[1] : k)) // 後方互換
    )
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
  condition_count?: number | null;
  unclassified_condition_count?: number | null;
  unclassified_jobs_count?: number | null;
  unclassified_candidates_count?: number | null;
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
  const [metricChart, setMetricChart] = useState<Metric>("candidates");
  const [sitesChart, setSitesChart] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [largeChart, setLargeChart] = useState<string[]>([]);
  const [smallChart, setSmallChart] = useState<string[]>([]); // ★合成キー
  const [prefChart, setPrefChart] = useState<string[]>([]);
  const [showChartFilters, setShowChartFilters] = useState(true);
  const [openChartCat, setOpenChartCat] = useState(false);
  const [openChartPref, setOpenChartPref] = useState(false);

  // ===== データ =====
  const [rowsChart, setRowsChart] = useState<ApiRow[]>([]);
  const [msgChart, setMsgChart] = useState("");
  const [loadingChart, setLoadingChart] = useState(false);

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
    const controller = new AbortController();
    (async () => {
      setLoadingChart(true);
      try {
        const resp = await fetch("/api/job-boards/metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            mode: modeChart,
            metric: metricChart,
            sites: sitesChart,
            large: largeChart,
            // ★合成キー → 小分類名へ変換して送る（後方互換）
            small: decodeSmallKeysToNames(smallChart),
            pref: prefChart,
            range: rangeChart,
          }),
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j?.error || "fetch error");
        setRowsChart(j.rows ?? []);
        setMsgChart("");
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setRowsChart([]);
        setMsgChart(String(e?.message || e));
      } finally {
        if (!controller.signal.aborted) setLoadingChart(false);
      }
    })();

    return () => controller.abort();
  }, [
    modeChart,
    metricChart,
    rangeChart,
    sitesChart.join(","),
    largeChart.join(","),
    smallChart.join(","), // ★
    prefChart.join(","),
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

  const siteTotals = useMemo(() => {
    const metricKey =
      metricChart === "jobs" ? "jobs_count" : "candidates_count";
    const unclassifiedMetricKey =
      metricChart === "jobs"
        ? "unclassified_jobs_count"
        : "unclassified_candidates_count";
    const bySite: Record<string, number> = {};
    const unclassifiedBySite: Record<string, number> = {};
    const unclassifiedConditionsBySite: Record<string, number> = {};
    for (const r of rowsChart) {
      const key = r.site_key;
      const val = Number((r as any)[metricKey] ?? 0);
      bySite[key] = (bySite[key] ?? 0) + (Number.isFinite(val) ? val : 0);
      const unclassifiedVal = Number((r as any)[unclassifiedMetricKey] ?? 0);
      unclassifiedBySite[key] =
        (unclassifiedBySite[key] ?? 0) +
        (Number.isFinite(unclassifiedVal) ? unclassifiedVal : 0);
      const unclassifiedConditionCount = Number(
        r.unclassified_condition_count ?? 0
      );
      unclassifiedConditionsBySite[key] =
        (unclassifiedConditionsBySite[key] ?? 0) +
        (Number.isFinite(unclassifiedConditionCount)
          ? unclassifiedConditionCount
          : 0);
    }
    return SITE_OPTIONS.filter((s) => sitesChart.includes(s.value))
      .map((s) => ({
        site: s.label,
        key: s.value,
        total: bySite[s.value] ?? 0,
        unclassifiedTotal: unclassifiedBySite[s.value] ?? 0,
        unclassifiedConditionCount:
          unclassifiedConditionsBySite[s.value] ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [rowsChart, metricChart, sitesChart]);

  const LoadingOverlay = () => (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
      <div className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-neutral-600 shadow-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600" />
        読み込み中です…
      </div>
    </div>
  );

  return (
    <>
      <AppHeader />
      <PageMain className="space-y-6">
        <PageHero
          eyebrow="Research Dashboard"
          title="媒体横断のトレンド把握と実行導線を統合"
          description="手動実行、履歴確認、通知設定、送信先管理を同じ導線で扱えるように再構成しました。フィルタとグラフを並べて、探索から共有までを止めずに進められます。"
          accent="gold"
          actions={[
            { href: "/job-boards/manual", label: "手動実行", variant: "primary" },
            { href: "/job-boards/runs", label: "自動実行履歴", variant: "secondary" },
          ]}
        />

        <SurfaceCard>
          <SectionTitle
            title="主要な機能"
            description="よく使う画面を用途別にまとめています。"
          />
          <ActionGrid
            items={[
              {
                href: "/job-boards/manual",
                title: "手動実行",
                description: "対象媒体と条件を指定して、その場で探索を走らせます。",
                icon: PlayCircle,
              },
              {
                href: "/job-boards/runs",
                title: "自動実行履歴",
                description: "毎月1日の自動取得結果を確認します。",
                icon: ChartSpline,
              },
              {
                href: "/job-boards/runs/settings",
                title: "自動実行設定",
                description: "完了メールの送信先と取得対象を管理します。",
                icon: FileCog,
              },
              {
                href: "/job-boards/manual/history",
                title: "手動実行履歴",
                description: "過去の実行と結果ログを見返します。",
                icon: FileClock,
              },
              {
                href: "/job-boards/mappings",
                title: "職種マッピング管理",
                description: "媒体ごとの差分を吸収するマッピングを管理します。",
                icon: MapPinned,
              },
              {
                href: "/job-boards/settings",
                title: "通知設定",
                description: "共有・通知の条件や送り先を調整します。",
                icon: FileCog,
              },
              {
                href: "/job-boards/logins",
                title: "ログイン情報",
                description: "媒体ごとの認証情報を保守します。",
                icon: ShieldCheck,
              },
            ]}
          />
        </SurfaceCard>

        {/* ====== KPI＋折れ線グラフ ====== */}
        <section className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
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
              value={smallChart.length ? String(smallChart.length) : "すべて"} // ★合成キー数を表示
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

            </div>
          )}

          {/* 折れ線グラフ */}
          <div className="relative h-64 mt-3">
            {loadingChart && <LoadingOverlay />}
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

          {/* 表（サイト別合計） */}
          <div className="relative overflow-x-auto rounded-xl border border-neutral-200 mt-5">
            {loadingChart && <LoadingOverlay />}
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">サイト</th>
                  <th className="px-3 py-3 text-left">
                    合計（{metricChart === "jobs" ? "求人数" : "求職者数"}）
                  </th>
                  <th className="px-3 py-3 text-left">職種未分類</th>
                </tr>
              </thead>
              <tbody>
                {siteTotals.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      データがありません
                    </td>
                  </tr>
                ) : (
                  siteTotals.map((r) => (
                    <tr key={r.key} className="border-t border-neutral-200">
                      <td className="px-3 py-3">{r.site}</td>
                      <td className="px-3 py-3 tabular-nums">
                        {r.total.toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        {r.unclassifiedConditionCount > 0 ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                            {r.unclassifiedConditionCount.toLocaleString()}条件 /{" "}
                            {r.unclassifiedTotal.toLocaleString()}
                            {metricChart === "jobs" ? "件" : "名"}
                          </span>
                        ) : (
                          <span className="text-neutral-400">なし</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {msgChart && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
              {msgChart}
            </pre>
          )}
        </section>

        {/* モーダル */}
        {openChartCat && (
          <JobCategoryModal
            large={largeChart}
            small={smallChart} // ★合成キーのまま渡す
            onCloseAction={() => setOpenChartCat(false)}
            onApplyAction={(L, S) => {
              setLargeChart(L);
              setSmallChart(S); // ★合成キー保持
              setOpenChartCat(false);
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
      </PageMain>
    </>
  );
}
