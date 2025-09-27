"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PlusCircle, List, Users, Settings } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useRouter } from "next/navigation";

type Summary = {
  campaignCount: number;
  sent30: number;
  reachRate: number; // %
  openRate: number; // %
  unsub30: number;
  series: { date: string; count: number }[];
};

export default function EmailLanding() {
  const [data, setData] = useState<Summary | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/email/summary")
      .then((r) => r.json())
      .then((j) => setData(j?.metrics ?? null))
      .catch(() => setData(null));
  }, []);

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
              d="M12 2c-.9 2.6-2.9 4.6-5.5 5.5C9.1 8.4 11.1 10.4 12 13c.9-2.6 2.9-4.6 5.5-5.5C14.9 6.6 12.9 4.6 12 2zM5 14c2.9.6 5.3 2.9 5.9 5.9c-2.9-.6-5.3-2.9-5.9-5.9zm14 0c-.6 2.9-2.9 5.3-5.9 5.9c.6-2.9 2.9-5.3 5.9-5.9z"
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              メール配信
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              キャンペーンの作成・配信とKPIの確認
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/campaigns/new"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              <PlusCircle
                className="h-5 w-5 text-neutral-600"
                strokeWidth={1.5}
              />
              新規キャンペーン
            </Link>
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              <List className="h-5 w-5 text-neutral-600" strokeWidth={1.5} />
              キャンペーン一覧
            </Link>
            <Link
              href="/recipients"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              <Users className="h-5 w-5 text-neutral-600" strokeWidth={1.5} />
              求職者リスト
            </Link>
            {/* ★追加：メール用設定ページへ */}
            <Link
              href="/email/settings"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              <Settings
                className="h-5 w-5 text-neutral-600"
                strokeWidth={1.5}
              />
              メール用設定
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <KpiCard
            label="キャンペーン総数"
            value={data?.campaignCount ?? "-"}
          />
          <KpiCard label="直近30日の配信数" value={data?.sent30 ?? "-"} />
          <KpiCard label="メール到達率" value={`${data?.reachRate ?? 0}%`} />
          <KpiCard label="メール開封率" value={`${data?.openRate ?? 0}%`} />
          <KpiCard label="配信停止数(30日)" value={data?.unsub30 ?? "-"} />
        </div>

        <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 text-sm text-neutral-500">直近14日の配信数</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.series ?? []}>
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </>
  );
}
