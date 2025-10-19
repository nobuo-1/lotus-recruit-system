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
  PlusCircle,
  List,
  Users,
  Settings,
  Mail,
  Clock,
  Megaphone,
  ChevronDown,
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

  return (
    <>
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
              if (typeof window !== "undefined" && window.history.length > 1)
                window.history.back();
              else router.push("/dashboard");
            }}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
            aria-label="前のページに戻る"
          >
            戻る
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {/* ヘッダー行 */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
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
              キャンペーン / メールの作成・配信とKPIの確認
            </p>
          </div>

          {/* トグル式アクションメニュー（グルーピング＋羅列） */}
          <div className="relative">
            <button
              type="button"
              aria-expanded={openActions}
              onClick={() => setOpenActions((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              操作メニュー
              <ChevronDown
                className={`h-4 w-4 text-neutral-600 transition-transform ${
                  openActions ? "rotate-180" : ""
                }`}
              />
            </button>

            {openActions && (
              <div className="absolute right-0 z-10 mt-2 w-[360px] rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
                {/* メール */}
                <div className="mb-2 rounded-xl border border-neutral-100 p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-neutral-700">
                    <Mail className="h-4 w-4 text-neutral-600" />
                    メール
                  </div>
                  <ul className="ml-6 list-disc space-y-1 text-sm">
                    <li>
                      <Link
                        href="/mails/new"
                        className="text-neutral-800 hover:underline"
                      >
                        新規メール
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/mails"
                        className="text-neutral-800 hover:underline"
                      >
                        メール一覧
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/mails/schedules"
                        className="text-neutral-800 hover:underline"
                      >
                        メール予約リスト
                      </Link>
                    </li>
                  </ul>
                </div>

                {/* キャンペーン */}
                <div className="mb-2 rounded-xl border border-neutral-100 p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-neutral-700">
                    <Megaphone className="h-4 w-4 text-neutral-600" />
                    キャンペーン
                  </div>
                  <ul className="ml-6 list-disc space-y-1 text-sm">
                    <li>
                      <Link
                        href="/campaigns/new"
                        className="text-neutral-800 hover:underline"
                      >
                        新規キャンペーン
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/campaigns"
                        className="text-neutral-800 hover:underline"
                      >
                        キャンペーン一覧
                      </Link>
                    </li>
                    {/* ← 修正：正しいURLに */}
                    <li>
                      <Link
                        href="/email/schedules"
                        className="text-neutral-800 hover:underline"
                      >
                        キャンペーン予約リスト
                      </Link>
                    </li>
                  </ul>
                </div>

                {/* 受信者 */}
                <div className="rounded-xl border border-neutral-100 p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-neutral-700">
                    <Users className="h-4 w-4 text-neutral-600" />
                    受信者
                  </div>
                  <ul className="ml-6 list-disc space-y-1 text-sm">
                    <li>
                      <Link
                        href="/recipients"
                        className="text-neutral-800 hover:underline"
                      >
                        受信者リスト
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            )}
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

        {/* 折れ線グラフ */}
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
