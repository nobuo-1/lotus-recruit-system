// web/src/app/form-outreach/page.tsx
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

type Summary = {
  tplCount: number;
  prospectCount: number;
  sentThisMonth: number;
  allSent: number;
};
type SeriesPoint = { date: string; count: number };

export default function FormOutreachTop() {
  const [kpi, setKpi] = useState<Summary | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/form-outreach/summary", {
          cache: "no-store",
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "fetch error");
        setKpi(j);
        setMsg("");
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/form-outreach/series?range=30d", {
          cache: "no-store",
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "fetch error");
        setSeries(j?.rows ?? []);
      } catch (e) {}
    })();
  }, []);

  const periodTotal = useMemo(
    () => series.reduce((s, p) => s + (p.count || 0), 0),
    [series]
  );

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-[26px] md:text-[24px] font-extrabold tracking-tight text-indigo-900">
            フォーム営業
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            見込み企業の抽出・メッセージ送信とKPI
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
            <section>
              <div className="mb-2 text-lg font-semibold text-neutral-900">
                運用
              </div>
              <ul className="space-y-1.5">
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
                    href="/form-outreach/messages"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    送信ログ
                  </Link>
                </li>
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
                    href="/form-outreach/companies"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    企業一覧
                  </Link>
                </li>
              </ul>
            </section>
            <section>
              <div className="mb-2 text-lg font-semibold text-neutral-900">
                設定
              </div>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/senders"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    送信元設定
                  </Link>
                </li>
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

        <header className="mb-2">
          <h2 className="text-2xl md:text-[24px] font-semibold text-neutral-900">
            各KPI
          </h2>
        </header>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="テンプレ数"
            value={kpi?.tplCount ?? "-"}
            className="ring-1 ring-indigo-100 shadow-sm"
          />
          <KpiCard
            label="見込み企業数"
            value={kpi?.prospectCount ?? "-"}
            className="ring-1 ring-sky-100 shadow-sm"
          />
          <KpiCard
            label="当月送信数"
            value={kpi?.sentThisMonth ?? "-"}
            className="ring-1 ring-emerald-100 shadow-sm"
          />
          <KpiCard
            label="累計送信数"
            value={kpi?.allSent ?? "-"}
            className="ring-1 ring-neutral-100 shadow-sm"
          />
        </div>

        {/* 送信数折れ線（メール配信ページと同デザイン） */}
        <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 text-base font-semibold text-neutral-800">
            直近30日の送信数（合計：{periodTotal}）
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
