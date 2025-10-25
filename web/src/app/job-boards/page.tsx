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
import Link from "next/link";

type Period = "month" | "year" | "3y";
type SeriesPoint = { x: string; jobs: number; candidates: number };
type SiteSeries = { site: string; points: SeriesPoint[] };

export default function JobBoardsTop() {
  const [sites, setSites] = useState<string[]>([]);
  const [activeSite, setActiveSite] = useState<string>("");
  const [period, setPeriod] = useState<Period>("month");

  const [large, setLarge] = useState<string>("");
  const [small, setSmall] = useState<string>("");

  const [series, setSeries] = useState<SiteSeries | null>(null);
  const [msg, setMsg] = useState("");

  // サイト一覧
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/job-boards/sites", { cache: "no-store" });
        const j = await res.json();
        const list: string[] = j?.sites ?? [];
        setSites(list);
        if (!activeSite && list.length > 0) setActiveSite(list[0]);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []); // 初回

  // 時系列の取得
  useEffect(() => {
    if (!activeSite) return;
    (async () => {
      try {
        const params = new URLSearchParams({
          site: activeSite,
          period,
          ...(large ? { large } : {}),
          ...(small ? { small } : {}),
        });
        const res = await fetch(`/api/job-boards/series?${params}`, {
          cache: "no-store",
        });
        const j = await res.json();
        setSeries(j?.series ?? null);
        setMsg("");
      } catch (e: any) {
        setSeries(null);
        setMsg(String(e?.message || e));
      }
    })();
  }, [activeSite, period, large, small]);

  const totalJobs = useMemo(
    () => (series?.points ?? []).reduce((s, p) => s + (p.jobs || 0), 0),
    [series]
  );
  const totalCandidates = useMemo(
    () => (series?.points ?? []).reduce((s, p) => s + (p.candidates || 0), 0),
    [series]
  );

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル */}
        <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              転職サイトリサーチ
            </h1>
            <p className="text-sm text-neutral-500">
              媒体別に、週次推移／月次最新で求人数と求職者数を比較
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/job-boards/runs"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              実行状況
            </Link>
            <Link
              href="/job-boards/settings"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              設定
            </Link>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="サイト" value={activeSite || "-"} />
          <KpiCard label="期間内 求人数合計" value={totalJobs} />
          <KpiCard label="期間内 求職者数合計" value={totalCandidates} />
          <KpiCard label="データ点数" value={series?.points?.length ?? 0} />
        </div>

        {/* フィルタ&期間 */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 p-4">
            <div className="text-sm text-neutral-600 mb-1">サイト</div>
            <div className="flex flex-wrap gap-2">
              {sites.map((s) => (
                <button
                  key={s}
                  onClick={() => setActiveSite(s)}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    activeSite === s
                      ? "border border-indigo-400 text-indigo-700"
                      : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {s}
                </button>
              ))}
              {sites.length === 0 && (
                <span className="text-neutral-400 text-sm">
                  サイトがありません
                </span>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-4">
            <div className="text-sm text-neutral-600 mb-1">
              職種（内部区分）
            </div>
            <div className="flex items-center gap-2">
              <input
                placeholder="internal_large を指定"
                className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                value={large}
                onChange={(e) => setLarge(e.target.value)}
              />
              <input
                placeholder="internal_small を指定"
                className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                value={small}
                onChange={(e) => setSmall(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-4">
            <div className="text-sm text-neutral-600 mb-1">期間</div>
            <div className="flex flex-wrap gap-2">
              {(["month", "year", "3y"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    period === p
                      ? "border border-neutral-400 text-neutral-800"
                      : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {p === "month"
                    ? "直近数ヶ月（週次）"
                    : p === "year"
                    ? "1年（各月最新）"
                    : "3年（各月最新）"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* グラフ */}
        <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 text-sm text-neutral-600">
            期間内の推移（{activeSite || "-"}）
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series?.points ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="jobs"
                  name="求人数"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="candidates"
                  name="求職者数"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 表 */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[800px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left w-40">日付/週</th>
                <th className="px-3 py-3 text-left">求人数</th>
                <th className="px-3 py-3 text-left">求職者数</th>
              </tr>
            </thead>
            <tbody>
              {(series?.points ?? []).map((p) => (
                <tr key={p.x} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{p.x}</td>
                  <td className="px-3 py-2">{p.jobs}</td>
                  <td className="px-3 py-2">{p.candidates}</td>
                </tr>
              ))}
              {(series?.points ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
