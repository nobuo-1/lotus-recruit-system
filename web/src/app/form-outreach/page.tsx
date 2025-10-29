"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import dynamic from "next/dynamic";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

// Recharts (CSRのみ)
const ResponsiveContainer = dynamic(
  async () => (await import("recharts")).ResponsiveContainer,
  { ssr: false }
);
const LineChart = dynamic(async () => (await import("recharts")).LineChart, {
  ssr: false,
});
const Line = dynamic(async () => (await import("recharts")).Line, {
  ssr: false,
});
const XAxis = dynamic(async () => (await import("recharts")).XAxis, {
  ssr: false,
});
const YAxis = dynamic(async () => (await import("recharts")).YAxis, {
  ssr: false,
});
const Tooltip = dynamic(async () => (await import("recharts")).Tooltip, {
  ssr: false,
});
const CartesianGrid = dynamic(
  async () => (await import("recharts")).CartesianGrid,
  { ssr: false }
);

type RunRow = {
  id: string;
  status: string | null;
  started_at: string | null;
};

type Kpi = {
  templates: number;
  companies: number;
  runs30d: number;
  successRate: number;
};

export default function FormOutreachTop() {
  const [kpi, setKpi] = useState<Kpi>({
    templates: 0,
    companies: 0,
    runs30d: 0,
    successRate: 0,
  });
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      setMsg("");
      try {
        const [rTpl, rCom, rRun] = await Promise.all([
          fetch("/api/form-outreach/templates", {
            headers: { "x-tenant-id": TENANT_ID },
            cache: "no-store",
          }),
          fetch("/api/form-outreach/companies", {
            headers: { "x-tenant-id": TENANT_ID },
            cache: "no-store",
          }),
          fetch("/api/form-outreach/runs", {
            headers: { "x-tenant-id": TENANT_ID },
            cache: "no-store",
          }),
        ]);
        const jTpl = await rTpl.json();
        const jCom = await rCom.json();
        const jRun = await rRun.json();

        if (!rTpl.ok) throw new Error(jTpl?.error || "templates fetch failed");
        if (!rCom.ok) throw new Error(jCom?.error || "companies fetch failed");
        if (!rRun.ok) throw new Error(jRun?.error || "runs fetch failed");

        const rowsRun: RunRow[] = jRun.rows ?? [];

        // 30日内の実行数/成功率
        const now = new Date();
        const thirtyAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
        const last30 = rowsRun.filter((r) => {
          const d = r.started_at ? new Date(r.started_at) : null;
          return d && d >= thirtyAgo;
        });
        const success = last30.filter((r) =>
          (r.status || "").toLowerCase().includes("success")
        ).length;

        setKpi({
          templates: (jTpl.rows ?? []).length,
          companies: (jCom.rows ?? []).length,
          runs30d: last30.length,
          successRate: last30.length
            ? Math.round((success / last30.length) * 100)
            : 0,
        });

        setRuns(rowsRun);
      } catch (e: any) {
        setMsg(String(e?.message || e));
        setRuns([]);
      }
    };
    load();
  }, []);

  // 直近8週間の週初ごと集計
  const series = useMemo(() => {
    const map: Record<string, number> = {};
    function mondayKey(d: Date) {
      const copy = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      );
      const wd = copy.getUTCDay(); // 0..6
      const diff = (wd + 6) % 7; // 月曜=0
      copy.setUTCDate(copy.getUTCDate() - diff);
      return copy.toISOString().slice(0, 10);
    }
    for (const r of runs) {
      if (!r.started_at) continue;
      const key = mondayKey(new Date(r.started_at));
      map[key] = (map[key] ?? 0) + 1;
    }
    const out: { week: string; count: number }[] = [];
    const today = new Date();
    for (let i = 7; i >= 0; i--) {
      const dt = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate()
        )
      );
      dt.setUTCDate(dt.getUTCDate() - i * 7);
      const wd = dt.getUTCDay();
      const diff = (wd + 6) % 7;
      const m = new Date(dt);
      m.setUTCDate(m.getUTCDate() - diff);
      const k = m.toISOString().slice(0, 10);
      out.push({ week: k, count: map[k] ?? 0 });
    }
    return out;
  }, [runs]);

  const KpiCard = ({
    label,
    value,
  }: {
    label: string;
    value: string | number;
  }) => (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-900">{value}</div>
    </div>
  );

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-3">
          <h1 className="text-2xl font-semibold text-neutral-900">
            フォーム営業
          </h1>
          <p className="text-sm text-neutral-500">
            企業管理・テンプレ・実行・ログ・送信元設定・自動実行
          </p>
        </div>

        {/* リスト型ナビ（以前の“リスト感”に戻す） */}
        <nav className="mb-6 rounded-2xl border border-neutral-200 divide-y divide-neutral-200 overflow-hidden">
          {[
            { href: "/form-outreach/companies", label: "企業一覧" },
            { href: "/form-outreach/runs/manual", label: "手動実行" },
            {
              href: "/form-outreach/schedules",
              label: "送信ログ / スケジュール",
            },
            {
              href: "/form-outreach/templates",
              label: "メッセージテンプレート",
            },
            { href: "/form-outreach/senders", label: "送信元設定" },
            { href: "/form-outreach/automation", label: "自動実行設定" },
          ].map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
            >
              <span className="text-sm text-neutral-800">{i.label}</span>
              <span className="text-neutral-400">›</span>
            </Link>
          ))}
        </nav>

        {/* KPI（入れ子にせず単独セクションのまま） */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="テンプレ数" value={kpi.templates} />
            <KpiCard label="企業数" value={kpi.companies} />
            <KpiCard label="直近30日 実行" value={kpi.runs30d} />
            <KpiCard label="成功率(30日)" value={`${kpi.successRate}%`} />
          </div>
        </section>

        {/* グラフ（単独セクション） */}
        <section className="rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 text-sm font-medium text-neutral-800">
            直近8週間の実行推移
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {msg && (
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
