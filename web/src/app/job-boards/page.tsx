// web/src/app/job-boards/page.tsx
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
import { Settings, RefreshCw } from "lucide-react";

type Summary = {
  runCount14: number;
  successRate30: number; // %
  avgDurationSec14: number;
  queuedNow: number;
  last20: {
    id: string;
    site: string;
    status: string;
    error?: string | null;
    started_at: string;
    finished_at?: string | null;
  }[];
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

  const fmtPct = (x?: number) =>
    Number.isFinite(Number(x)) ? `${Number(x).toFixed(2)}%` : "-";
  const fmtSec = (x?: number) =>
    Number.isFinite(Number(x)) ? `${Number(x).toFixed(1)}秒` : "-";

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-[26px] font-extrabold tracking-tight text-indigo-900">
            転職サイトリサーチ
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            実行状況と履歴（テナント別）
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
              href="/job-boards/runs"
              icon={RefreshCw}
              title="取得状況の詳細"
              desc="履歴の一覧・ページング"
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

        {/* KPI（実行系） */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="直近14日 実行回数" value={data?.runCount14 ?? "-"} />
          <KpiCard
            label="直近30日 成功率"
            value={fmtPct(data?.successRate30)}
          />
          <KpiCard
            label="平均処理時間（14日）"
            value={fmtSec(data?.avgDurationSec14)}
          />
          <KpiCard label="現在のキュー数" value={data?.queuedNow ?? 0} />
        </div>

        {/* 直近20件（常時表示） */}
        <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-base font-semibold text-neutral-800">
              直近の取得状況（20件）
            </div>
            <Link
              href="/job-boards/runs"
              className="text-sm text-indigo-700 underline-offset-2 hover:underline"
            >
              詳細を見る
            </Link>
          </div>
          <ul className="space-y-2">
            {(data?.last20 ?? []).map((r) => (
              <li key={r.id} className="text-sm">
                <span className="inline-block w-20 font-mono text-neutral-500">
                  {r.site}
                </span>
                <span
                  className={`inline-block w-20 ${
                    r.status === "success"
                      ? "text-emerald-600"
                      : r.status === "failed"
                      ? "text-rose-600"
                      : "text-neutral-700"
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
