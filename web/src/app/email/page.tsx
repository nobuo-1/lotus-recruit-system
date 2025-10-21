// web/src/app/email/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type Summary = {
  campaignCount: number;
  sent30: number;
  reachRate: number; // %
  openRate: number; // %
  unsub30: number;
  series: { date: string; count: number }[];
};

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";

/* --- 共通UI: セクション & リンクカード --- */
const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <section className="rounded-2xl border border-neutral-200 p-4">
    <h2 className="mb-3 flex items-center gap-2 text-lg md:text-xl font-semibold text-neutral-900">
      <span className="inline-flex h-5 w-5 items-center justify-center text-neutral-700">
        {icon}
      </span>
      {title}
    </h2>
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{children}</div>
  </section>
);

const ItemLink: React.FC<{ href: string; children: React.ReactNode }> = ({
  href,
  children,
}) => (
  <Link
    href={href}
    className="block rounded-xl border border-neutral-200 px-4 py-3 text-[15px] md:text-base text-neutral-800 hover:bg-neutral-50"
  >
    {children}
  </Link>
);

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
    () => (typeof data?.openRate === "number" ? `${data?.openRate}%` : "-"),
    [data?.openRate]
  );

  return (
    <>
      <AppHeader />

      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル */}
        <div className="mb-3">
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            メール配信
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            メール/キャンペーンの作成・配信とKPIの確認
          </p>
        </div>

        {/* 機能メニュー（常時表示） */}
        <header className="mb-3">
          <h2 className="text-2xl md:text-[28px] font-semibold text-neutral-900">
            機能メニュー
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            メール配信・キャンペーン・各種設定へアクセスできます。
          </p>
        </header>

        <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* メール */}
          <Section
            title="メール"
            icon={
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6c0-1.1-.9-2-2-2Zm0 4-8 5L4 8V6l8 5 8-5v2Z" />
              </svg>
            }
          >
            <ItemLink href="/mails/new">新規メール</ItemLink>
            <ItemLink href="/mails">メール一覧</ItemLink>
            <ItemLink href="/mails/schedules">メール予約リスト</ItemLink>
          </Section>

          {/* キャンペーン */}
          <Section
            title="キャンペーン"
            icon={
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a2.5 2.5 0 1 0 .001-5.001A2.5 2.5 0 0 0 16.5 12Z" />
              </svg>
            }
          >
            <ItemLink href="/campaigns/new">新規キャンペーン</ItemLink>
            <ItemLink href="/campaigns">キャンペーン一覧</ItemLink>
            <ItemLink href="/email/schedules">キャンペーン予約リスト</ItemLink>
          </Section>

          {/* その他（受信者リスト + メール用設定） */}
          <Section
            title="その他"
            icon={<Settings className="h-5 w-5 text-neutral-700" />}
          >
            <ItemLink href="/recipients">受信者リスト</ItemLink>
            <ItemLink href="/email/settings">メール用設定</ItemLink>
          </Section>
        </div>

        {/* KPI */}
        <div className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-5">
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
        <div className="text-base font-medium text-neutral-700">
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
            <XAxis dataKey="date" tick={{ fontSize: 13 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
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
