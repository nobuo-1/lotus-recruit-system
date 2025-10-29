// web/src/app/form-outreach/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import KpiCard from "@/components/KpiCard";
import AppHeader from "@/components/AppHeader";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type SeriesPoint = { date: string; count: number };
type Summary = {
  templates: number;
  companies: number;
  allTimeRuns: number;
  successRate: number; // %
  series: {
    total: SeriesPoint[];
    form: SeriesPoint[];
    email: SeriesPoint[];
  };
};

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";
type Mode = "total" | "form" | "email";

export default function FormOutreachLanding() {
  const [data, setData] = useState<Summary | null>(null);
  const [range, setRange] = useState<RangeKey>("14d");
  const [mode, setMode] = useState<Mode>("total");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/form-outreach/summary?range=${range}`, {
          cache: "no-store",
        });
        const j = await res.json();
        setData(j?.metrics ?? null);
      } catch (e: any) {
        setMsg(String(e?.message || e));
        setData(null);
      }
    })();
  }, [range]);

  const series = useMemo(() => {
    if (!data) return [];
    if (mode === "form") return data.series.form;
    if (mode === "email") return data.series.email;
    return data.series.total;
  }, [data, mode]);

  const periodTotal = useMemo(
    () => series.reduce((s, p) => s + (p.count || 0), 0),
    [series]
  );

  const fmtPct = (n: unknown) => {
    const x = Number(n);
    return Number.isFinite(x) ? x.toFixed(2) : "0.00";
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル */}
        <div className="mb-4">
          <h1 className="text-[26px] md:text-[24px] font-extrabold tracking-tight text-indigo-900">
            フォーム営業
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            企業リスト管理・テンプレ・送信（手動/自動）とKPIの確認
          </p>
        </div>

        {/* 機能メニュー（メール配信トップに寄せる） */}
        <header className="mb-3">
          <h2 className="text-2xl md:text-[24px] font-semibold text-neutral-900">
            機能メニュー
          </h2>
        </header>

        <div className="mb-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
            <section>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                リスト / 実行
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/companies"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    企業一覧
                  </Link>
                </li>
                <li>
                  <Link
                    href="/form-outreach/runs/manual"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    手動実行
                  </Link>
                </li>
                <li>
                  <Link
                    href="/form-outreach/schedules"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    送信ログ / スケジュール
                  </Link>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                テンプレ / 送信元
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/templates"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    メッセージテンプレート
                  </Link>
                </li>
                <li>
                  <Link
                    href="/form-outreach/senders"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    送信元設定
                  </Link>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                自動化
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/automation"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    自動実行設定
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* 各KPI */}
        <header className="mb-2">
          <h2 className="text-2xl md:text-[24px] font-semibold text-neutral-900">
            各KPI
          </h2>
        </header>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <KpiCard label="テンプレ数" value={data?.templates ?? "-"} />
          <KpiCard label="企業数" value={data?.companies ?? "-"} />
          <KpiCard
            label="累計実行（全期間）"
            value={data?.allTimeRuns ?? "-"}
          />
          <KpiCard
            label="成功率（30日）"
            value={`${fmtPct(data?.successRate)}%`}
          />
          <KpiCard label="期間内合計" value={periodTotal} />
        </div>

        {/* 折れ線グラフ（期間/対象切り替え） */}
        <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-semibold text-neutral-800">
              直近{labelOf(range)}の実行数
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-1">
                {(["7d", "14d", "1m", "3m", "6m", "1y"] as RangeKey[]).map(
                  (r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`rounded-lg px-2 py-1 text-xs ${
                        range === r
                          ? "border border-neutral-400 text-neutral-800"
                          : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                      }`}
                    >
                      {labelOf(r)}
                    </button>
                  )
                )}
              </div>
              <div className="inline-flex items-center gap-1">
                {(["total", "form", "email"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-lg px-2 py-1 text-xs ${
                      mode === m
                        ? "border border-indigo-400 text-indigo-700"
                        : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    }`}
                  >
                    {m === "total"
                      ? "合計"
                      : m === "form"
                      ? "フォーム"
                      : "メール"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 13 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-500">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}

function labelOf(r: RangeKey) {
  switch (r) {
    case "7d":
      return "1週間";
    case "14d":
      return "14日";
    case "1m":
      return "1ヶ月";
    case "3m":
      return "3ヶ月";
    case "6m":
      return "半年";
    case "1y":
      return "1年";
    default:
      return r;
  }
}
