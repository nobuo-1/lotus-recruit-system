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
import { Settings, ChevronDown, Mail, Megaphone, Users } from "lucide-react";

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
  const [menuOpen, setMenuOpen] = useState(false);
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
      {/* グローバルヘッダー復活 */}
      <AppHeader />

      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル行 */}
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
                メール配信
              </h1>
              <Link
                href="/email/settings"
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 whitespace-nowrap hover:bg-neutral-50"
              >
                <Settings
                  className="h-4 w-4 text-neutral-600"
                  strokeWidth={1.6}
                />
                <span className="whitespace-nowrap text-sm">メール用設定</span>
              </Link>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              メール/キャンペーンの作成・配信とKPIの確認
            </p>
          </div>

          {/* 機能メニューボタン（他ページの遷移ボタンと同サイズ） */}
          <div className="w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex w-full items-center justify-between rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 sm:w-auto"
              aria-expanded={menuOpen}
            >
              機能メニュー
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* 機能メニュー：見出しにのみアイコン／リンクはアイコン無し */}
        {menuOpen && (
          <div className="mb-4 rounded-2xl border border-neutral-200 p-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* メール */}
              <section aria-labelledby="sec-mail">
                <div className="mb-2 flex items-center gap-2">
                  <Mail
                    className="h-4 w-4 text-neutral-600"
                    aria-hidden="true"
                  />
                  <h2
                    id="sec-mail"
                    className="text-base font-semibold text-neutral-800"
                  >
                    メール
                  </h2>
                </div>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/mails/new"
                      className="text-sm text-neutral-700 underline-offset-2 hover:underline"
                    >
                      新規メール
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/mails"
                      className="text-sm text-neutral-700 underline-offset-2 hover:underline"
                    >
                      メール一覧
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/mails/schedules"
                      className="text-sm text-neutral-700 underline-offset-2 hover:underline"
                    >
                      メール予約リスト
                    </Link>
                  </li>
                </ul>
              </section>

              {/* キャンペーン */}
              <section aria-labelledby="sec-campaigns">
                <div className="mb-2 flex items-center gap-2">
                  <Megaphone
                    className="h-4 w-4 text-neutral-600"
                    aria-hidden="true"
                  />
                  <h2
                    id="sec-campaigns"
                    className="text-base font-semibold text-neutral-800"
                  >
                    キャンペーン
                  </h2>
                </div>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/campaigns/new"
                      className="text-sm text-neutral-700 underline-offset-2 hover:underline"
                    >
                      新規キャンペーン
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/campaigns"
                      className="text-sm text-neutral-700 underline-offset-2 hover:underline"
                    >
                      キャンペーン一覧
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/email/schedules"
                      className="text-sm text-neutral-700 underline-offset-2 hover:underline"
                    >
                      キャンペーン予約リスト
                    </Link>
                  </li>
                </ul>
              </section>

              {/* 受信者 */}
              <section aria-labelledby="sec-recipients">
                <div className="mb-2 flex items-center gap-2">
                  <Users
                    className="h-4 w-4 text-neutral-600"
                    aria-hidden="true"
                  />
                  <h2
                    id="sec-recipients"
                    className="text-base font-semibold text-neutral-800"
                  >
                    受信者リスト
                  </h2>
                </div>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/recipients"
                      className="text-sm text-neutral-700 underline-offset-2 hover:underline"
                    >
                      受信者リスト
                    </Link>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        )}

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
