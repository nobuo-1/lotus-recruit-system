//web/src/app/job-boards/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import KpiCard from "@/components/KpiCard";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Settings, RefreshCw, BarChart3, Mail } from "lucide-react";

type Summary = {
  totalJobs: number;
  totalCandidates: number;
  runs: {
    site: string;
    status: string;
    started_at: string;
    error?: string | null;
  }[];
  series: { date: string; count: number }[];
  isAdmin: boolean;
};

export default function JobBoardsTop() {
  const [data, setData] = useState<Summary | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/job-boards/summary", {
          cache: "no-store",
        });
        const j = await res.json();
        setData(j?.metrics ?? null);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const total14 = useMemo(
    () => (data?.series ?? []).reduce((s, p) => s + (p.count || 0), 0),
    [data]
  );

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-[26px] font-extrabold tracking-tight text-indigo-900">
            転職サイトリサーチ
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            求人数・求職者数の定期取得／可視化（テナント別）
          </p>
        </div>

        {/* メニュー */}
        <div className="mb-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <MenuLink
              href="/job-boards/settings"
              icon={Settings}
              title="設定"
              desc="アカウント/通知/サイト選択"
            />
            <MenuLink
              href="/job-boards/results"
              icon={BarChart3}
              title="結果一覧"
              desc="表＋カテゴリ別の集計"
            />
            <button
              onClick={() => runNow("doda")}
              className="group rounded-2xl border border-neutral-200 p-4 text-left transition hover:bg-neutral-50"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-neutral-200 p-2 text-neutral-600 group-hover:text-neutral-800">
                  <RefreshCw size={18} />
                </div>
                <div>
                  <div className="font-medium text-neutral-900">
                    手動実行（Doda）
                  </div>
                  <div className="text-sm text-neutral-500">
                    テスト用に1サイトを即時取得
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="直近合計 求人数" value={data?.totalJobs ?? "-"} />
          <KpiCard
            label="直近合計 求職者数"
            value={data?.totalCandidates ?? "-"}
          />
          <KpiCard label="直近14日 保存結果" value={total14} />
          <KpiCard label="管理機能" value={data?.isAdmin ? "有効" : "—"} />
        </div>

        {/* 折れ線（直近14日） */}
        <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 text-base font-semibold text-neutral-800">
            直近14日の保存回数
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.series ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
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

        {/* 直近Runs */}
        <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-3 text-base font-semibold text-neutral-800">
            直近の取得状況
          </div>
          <ul className="space-y-2">
            {(data?.runs ?? []).slice(0, 10).map((r, i) => (
              <li key={i} className="text-sm">
                <span className="inline-block w-20 font-mono text-neutral-500">
                  {r.site}
                </span>
                <span
                  className={`inline-block w-20 ${
                    r.status === "success"
                      ? "text-emerald-600"
                      : r.status === "failed"
                      ? "text-rose-600"
                      : "text-neutral-600"
                  }`}
                >
                  {r.status}
                </span>
                <span className="text-neutral-500">
                  {new Date(r.started_at).toLocaleString()}
                </span>
                {r.error ? (
                  <span className="ml-2 text-rose-600">{r.error}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-500">
            {msg}
          </pre>
        )}
      </main>
    </>
  );

  async function runNow(site: string) {
    try {
      await fetch("/api/job-boards/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site }),
      });
      alert("実行をキューに追加しました。");
    } catch (e: any) {
      alert(e?.message || "error");
    }
  }
}

function MenuLink({ href, icon: Icon, title, desc }: any) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-neutral-200 p-4 transition hover:bg-neutral-50"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-neutral-200 p-2 text-neutral-600 group-hover:text-neutral-800">
          <Icon size={18} />
        </div>
        <div>
          <div className="font-medium text-neutral-900">{title}</div>
          <div className="text-sm text-neutral-500">{desc}</div>
        </div>
      </div>
    </Link>
  );
}
