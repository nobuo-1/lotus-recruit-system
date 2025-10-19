// web/src/app/email/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  Settings,
  ChevronDown,
  FilePlus2,
  Mails,
  CalendarClock,
  Megaphone,
  List,
  CalendarRange,
  Users,
} from "lucide-react";

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
  const [openActions, setOpenActions] = useState(false);
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

        <div className="flex items-center gap-2">
          <Link
            href="/email/settings"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 whitespace-nowrap"
          >
            <Settings className="h-4 w-4 text-neutral-600" strokeWidth={1.6} />
            <span>メール用設定</span>
          </Link>

          <button
            onClick={() => setOpenActions((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition
              ${
                openActions
                  ? "bg-neutral-200/60"
                  : "border border-neutral-200 hover:bg-neutral-50"
              }`}
            aria-expanded={openActions}
            aria-controls="action-menu"
          >
            使う機能を選ぶ
            <ChevronDown
              className={`h-4 w-4 text-neutral-600 transition-transform ${
                openActions ? "rotate-180" : ""
              }`}
            />
          </button>

          <button
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                router.push("/dashboard");
              }
            }}
            className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
            aria-label="前のページに戻る"
          >
            戻る
          </button>
        </div>
      </div>

      {/* アクションメニュー */}
      {openActions && (
        <div
          id="action-menu"
          className="mx-auto max-w-6xl px-4 pb-3 pt-2"
          role="region"
          aria-label="アクションメニュー"
        >
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
              {/* メール */}
              <div className="p-4 border-b md:border-b-0 md:border-r border-neutral-200">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-pink-700 text-sm font-semibold">
                  ✉️ メール
                </div>
                <nav className="mt-2 space-y-2 text-[15px] leading-6">
                  <Row
                    href="/mails/new"
                    icon={<FilePlus2 className="h-5 w-5" />}
                    label="新規メール"
                  />
                  <Row
                    href="/mails"
                    icon={<Mails className="h-5 w-5" />}
                    label="メール一覧"
                  />
                  <Row
                    href="/email/mails/schedules"
                    icon={<CalendarClock className="h-5 w-5" />}
                    label="メール予約リスト"
                  />
                </nav>
              </div>

              {/* キャンペーン */}
              <div className="p-4 border-b md:border-b-0 md:border-r border-neutral-200">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 text-sm font-semibold">
                  📣 キャンペーン
                </div>
                <nav className="mt-2 space-y-2 text-[15px] leading-6">
                  <Row
                    href="/campaigns/new"
                    icon={<Megaphone className="h-5 w-5" />}
                    label="新規キャンペーン"
                  />
                  <Row
                    href="/campaigns"
                    icon={<List className="h-5 w-5" />}
                    label="キャンペーン一覧"
                  />
                  <Row
                    href="/email/schedules"
                    icon={<CalendarRange className="h-5 w-5" />}
                    label="キャンペーン予約リスト"
                  />
                </nav>
              </div>

              {/* 受信者 */}
              <div className="p-4">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-teal-700 text-sm font-semibold">
                  👥 受信者
                </div>
                <nav className="mt-2 space-y-2 text-[15px] leading-6">
                  <Row
                    href="/recipients"
                    icon={<Users className="h-5 w-5" />}
                    label="受信者リスト"
                  />
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル */}
        <div className="flex items-center gap-2">
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            メール配信
          </h1>
          <Link
            href="/email/settings"
            className="sm:hidden inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 whitespace-nowrap"
          >
            <Settings className="h-4 w-4 text-neutral-600" strokeWidth={1.6} />
            <span>メール用設定</span>
          </Link>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          キャンペーン/メールの作成・配信とKPIの確認
        </p>

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

function Row({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 hover:border-neutral-200 hover:bg-neutral-50"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 shadow-sm">
        {icon}
      </span>
      <span className="text-[15px] font-medium text-neutral-900 group-hover:underline">
        {label}
      </span>
    </Link>
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
