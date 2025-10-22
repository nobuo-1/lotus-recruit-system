// web/src/app/email/page.tsx
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
import { Settings, Mail, Megaphone } from "lucide-react";

type SeriesPoint = { date: string; count: number };
type Summary = {
  mailTotal: number;
  campaignTotal: number;
  allTimeSends: number;
  reachRate: number; // %
  openRate: number; // %
  series: {
    total: SeriesPoint[];
    mail: SeriesPoint[];
    campaign: SeriesPoint[];
  };
};

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";
type Mode = "total" | "mail" | "campaign";

export default function EmailLanding() {
  const [data, setData] = useState<Summary | null>(null);
  const [range, setRange] = useState<RangeKey>("14d");
  const [mode, setMode] = useState<Mode>("total");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/email/summary?range=${range}`, {
          cache: "no-store",
        });
        const j = await res.json();
        setData(j?.metrics ?? null);
      } catch (e: any) {
        setMsg(String(e?.message || e));
        setData(null);
      }
    })();
  }, [range]); // KPI は API 側で独立しているため、期間変更時も正しい（モードには依存しない）

  const series = useMemo(() => {
    if (!data) return [];
    if (mode === "mail") return data.series.mail;
    if (mode === "campaign") return data.series.campaign;
    return data.series.total;
  }, [data, mode]);

  const periodTotal = useMemo(
    () => series.reduce((s, p) => s + (p.count || 0), 0),
    [series]
  );

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル（色を紺寄りに、機能メニューと同サイズ） */}
        <div className="mb-4">
          <h1 className="text-[24px] md:text-[24px] font-extrabold tracking-tight text-indigo-900">
            メール配信
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            メール/キャンペーンの作成・配信とKPIの確認
          </p>
        </div>

        {/* 機能メニュー */}
        <header className="mb-3">
          <h2 className="text-2xl md:text-[24px] font-semibold text-neutral-900">
            機能メニュー
          </h2>
        </header>

        <div className="mb-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
            {/* メール */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Mail className="h-5 w-5 text-neutral-700" />
                <h3 className="text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                  メール
                </h3>
              </div>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/mails/new"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    新規メール
                  </Link>
                </li>
                <li>
                  <Link
                    href="/mails"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    メール一覧
                  </Link>
                </li>
                <li>
                  <Link
                    href="/mails/schedules"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    メール予約リスト
                  </Link>
                </li>
              </ul>
            </section>

            {/* キャンペーン */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-neutral-700" />
                <h3 className="text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                  キャンペーン
                </h3>
              </div>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/campaigns/new"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    新規キャンペーン
                  </Link>
                </li>
                <li>
                  <Link
                    href="/campaigns"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    キャンペーン一覧
                  </Link>
                </li>
                <li>
                  <Link
                    href="/email/schedules"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    キャンペーン予約リスト
                  </Link>
                </li>
              </ul>
            </section>

            {/* その他 */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Settings className="h-5 w-5 text-neutral-700" />
                <h3 className="text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                  その他
                </h3>
              </div>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/recipients"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    受信者リスト
                  </Link>
                </li>
                <li>
                  <Link
                    href="/email/settings"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    メール用設定
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* 各KPI（目立つ3つ + レート） */}
        <header className="mb-2">
          <h2 className="text-2xl md:text-[24px] font-semibold text-neutral-900">
            各KPI
          </h2>
        </header>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {/* 目立たせる3枚 */}
          <KpiCard
            label="メール総数"
            value={data?.mailTotal ?? "-"}
            className="md:col-span-1 col-span-2 ring-1 ring-indigo-100 shadow-sm"
          />
          <KpiCard
            label="キャンペーン総数"
            value={data?.campaignTotal ?? "-"}
            className="md:col-span-1 col-span-2 ring-1 ring-sky-100 shadow-sm"
          />
          <KpiCard
            label="累計配信数（全期間）"
            value={data?.allTimeSends ?? "-"}
            className="md:col-span-1 col-span-2 ring-1 ring-emerald-100 shadow-sm"
          />

          {/* レート類 */}
          <KpiCard
            label="メール到達率（30日）"
            value={`${data?.reachRate ?? 0}%`}
          />
          <KpiCard
            label="メール開封率（30日）"
            value={`${data?.openRate ?? 0}%`}
          />
        </div>

        {/* 折れ線グラフ（期間切替 + 対象切替を分離、合計表示をグラフ内に） */}
        <ChartBlock
          range={range}
          setRange={setRange}
          mode={mode}
          setMode={setMode}
          series={series}
          periodTotal={periodTotal}
        />

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-500">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}

function ChartBlock({
  range,
  setRange,
  mode,
  setMode,
  series,
  periodTotal,
}: {
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  mode: "total" | "mail" | "campaign";
  setMode: (m: "total" | "mail" | "campaign") => void;
  series: { date: string; count: number }[];
  periodTotal: number;
}) {
  const modeLabel =
    mode === "total" ? "合計" : mode === "mail" ? "メール" : "キャンペーン";

  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-base font-semibold text-neutral-800">
          <span className="font-bold">直近{labelOf(range)}の配信数</span>
        </div>
        {/* トグル群を分離表示 */}
        <div className="flex flex-wrap gap-2">
          {/* 期間 */}
          <div className="inline-flex items-center gap-1">
            {(["7d", "14d", "1m", "3m", "6m", "1y"] as RangeKey[]).map((r) => (
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
            ))}
          </div>
          {/* 対象 */}
          <div className="inline-flex items-center gap-1">
            {(["total", "mail", "campaign"] as const).map((m) => (
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
                  : m === "mail"
                  ? "メール"
                  : "キャンペーン"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 期間内の総配信数（対象に応じて変化） */}
      <div className="mb-2 text-sm text-neutral-600">
        {modeLabel}の期間内総配信数：
        <span className="font-semibold">{periodTotal}</span>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 13 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
            <Tooltip />
            {/* 線を少し太く */}
            <Line type="monotone" dataKey="count" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
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
