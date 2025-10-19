// web/src/app/email/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusCircle, List, Users, Settings, Mail } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Summary = {
  campaignCount: number;
  sent30: number;
  reachRate: number; // %
  openRate: number; // %
  unsub30: number;
  series: { date: string; count: number }[];
};

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";

export default function EmailLanding() {
  const [data, setData] = useState<Summary | null>(null);
  const [range, setRange] = useState<RangeKey>("14d");
  const [msg, setMsg] = useState("");
  const router = useRouter();

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
  }, [range]);

  const series = data?.series ?? [];
  const reach = useMemo(
    () => (typeof data?.reachRate === "number" ? `${data.reachRate}%` : "-"),
    [data?.reachRate]
  );
  const open = useMemo(
    () => (typeof data?.openRate === "number" ? `${data.openRate}%` : "-"),
    [data?.openRate]
  );

  const Header = () => (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2"
          aria-label="ダッシュボードへ"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            className="text-neutral-800"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M12 2c-.9 2.6-2.9 4.6-5.5 5.5C9.1 8.4 11.1 10.4 12 13c.9-2.6 2.9-4.6 5.5-5.5C14.9 6.6 12.9 4.6 12 2zM5 14c2.9.6 5.3 2.9 5.9 5.9c-.6 2.9-2.9 5.3-5.9 5.9zM19 14c-.6 2.9-2.9 5.3-5.9 5.9c.6-2.9 2.9-5.3 5.9-5.9z"
            />
          </svg>
          <span className="text-sm font-semibold tracking-wide text-neutral-900">
            Lotus Recruit
          </span>
        </Link>

        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back();
            } else {
              router.push("/dashboard");
            }
          }}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
          aria-label="前のページに戻る"
        >
          戻る
        </button>
      </div>
    </header>
  );

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl p-6">
        {/* ヘッダー行（スマホは縦積み、md+は従来どおり横並び） */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          {/* 左側：タイトル＋説明＋設定 */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
                メール配信
              </h1>
              <Link
                href="/email/settings"
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 whitespace-nowrap"
              >
                <Settings
                  className="h-4 w-4 text-neutral-600"
                  strokeWidth={1.6}
                />
                <span className="whitespace-nowrap">メール用設定</span>
              </Link>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              キャンペーン / プレーンテキストメールの作成・配信とKPIの確認
            </p>
          </div>

          {/* 右側：操作ボタン群（スマホでは下に縦積み） */}
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2 lg:grid-cols-4">
            {/* キャンペーン系 */}
            <Link
              href="/campaigns/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              <PlusCircle
                className="h-5 w-5 text-neutral-600"
                strokeWidth={1.5}
              />
              <span className="whitespace-nowrap">新規キャンペーン</span>
            </Link>
            <Link
              href="/campaigns"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              <List className="h-5 w-5 text-neutral-600" strokeWidth={1.5} />
              <span className="whitespace-nowrap">キャンペーン一覧</span>
            </Link>

            {/* 受信者 */}
            <Link
              href="/recipients"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              <Users className="h-5 w-5 text-neutral-600" strokeWidth={1.5} />
              <span className="whitespace-nowrap">受信者リスト</span>
            </Link>

            {/* メール（プレーンテキスト） */}
            <Link
              href="/mails/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              <Mail className="h-5 w-5 text-neutral-600" strokeWidth={1.5} />
              <span className="whitespace-nowrap">新規メール</span>
            </Link>
            <Link
              href="/mails"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              <List className="h-5 w-5 text-neutral-600" strokeWidth={1.5} />
              <span className="whitespace-nowrap">メール一覧</span>
            </Link>

            {/* 予約リスト（分離） */}
            <Link
              href="/mails/schedules"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              <List className="h-5 w-5 text-neutral-600" strokeWidth={1.5} />
              <span className="whitespace-nowrap">メール予約リスト</span>
            </Link>
            <Link
              href="/campaigns/schedules"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
            >
              <List className="h-5 w-5 text-neutral-600" strokeWidth={1.5} />
              <span className="whitespace-nowrap">キャンペーン予約リスト</span>
            </Link>
          </div>
        </div>

        {/* KPI */}
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <KpiCard
            label="キャンペーン総数"
            value={data?.campaignCount ?? "-"}
          />
          <KpiCard label="直近30日の配信数" value={data?.sent30 ?? "-"} />
          <KpiCard label="メール到達率" value={reach} />
          <KpiCard label="メール開封率" value={open} />
          <KpiCard label="配信停止数(30日)" value={data?.unsub30 ?? "-"} />
        </div>

        {/* 折れ線グラフ（期間切替） */}
        <ChartBlock range={range} setRange={setRange} series={series} />

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
  series,
}: {
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  series: { date: string; count: number }[];
}) {
  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-neutral-500">
          直近{labelOf(range)}の配信数
        </div>
        <div className="flex flex-wrap gap-1">
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
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="count" dot={false} />
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
