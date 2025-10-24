// web/src/app/job-boards/Client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type Site = "mynavi" | "doda" | "type" | "wtype" | "rikunabi" | "en";
const SITE_LABEL: Record<Site, string> = {
  mynavi: "マイナビ",
  doda: "Doda",
  type: "type",
  wtype: "女の転職type",
  rikunabi: "リクナビNEXT",
  en: "エン転職",
};

type Period = "1m" | "1y" | "3y";

type MetricPoint = { month: string; postings: number; seekers: number };
type MetricsResp = {
  ok: boolean;
  filters: {
    sites: Site[];
    category?: string;
    location?: string;
    salaryBand?: string;
    employment?: string;
    ageBand?: string;
  };
  series: MetricPoint[]; // 月単位
  totals: {
    postings: number;
    seekers: number;
  };
};
type RunItem = {
  id: string;
  site: string;
  status: "queued" | "running" | "success" | "failed";
  started_at: string;
  finished_at?: string | null;
  note?: string | null;
};
type SummaryResp = {
  ok: boolean;
  kpi: {
    runs30: number;
    success30: number;
    fail30: number;
    successRate30: number; // %
    lastRunAt?: string | null;
    lastFailedAt?: string | null;
    nextScheduleAt?: string | null;
  };
  latest: RunItem[]; // 直近20件
};

export default function Client() {
  const [sites, setSites] = useState<Site[]>([
    "mynavi",
    "doda",
    "type",
    "wtype",
  ]);
  const [period, setPeriod] = useState<Period>("1y");

  const [metrics, setMetrics] = useState<MetricsResp | null>(null);
  const [summary, setSummary] = useState<SummaryResp | null>(null);
  const [msg, setMsg] = useState("");

  // 取得
  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams();
        qs.set("period", period);
        qs.set("sites", sites.join(","));
        const res = await fetch(`/api/job-boards/metrics?${qs.toString()}`, {
          cache: "no-store",
        });
        setMetrics(await res.json());
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, [sites, period]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/job-boards/summary`, {
          cache: "no-store",
        });
        setSummary(await res.json());
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const totalsText = useMemo(() => {
    const p = metrics?.totals.postings ?? 0;
    const s = metrics?.totals.seekers ?? 0;
    return `求人数 ${p.toLocaleString()} / 求職者 ${s.toLocaleString()}`;
  }, [metrics]);

  const successRateText = (summary?.kpi.successRate30 ?? 0).toFixed(1) + "%";

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* ヘッダ */}
      <div className="mb-2">
        <h1 className="text-[26px] font-extrabold tracking-tight text-indigo-900">
          転職サイトリサーチ
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          各サイトの求人数・求職者数の月次推移と直近の収集状況
        </p>
      </div>

      {/* KPI：実行系のみ */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card
          label="30日 実行回数"
          value={summary?.kpi.runs30 ?? "-"}
          tone="indigo"
        />
        <Card
          label="30日 成功回数"
          value={summary?.kpi.success30 ?? "-"}
          tone="emerald"
        />
        <Card
          label="30日 失敗回数"
          value={summary?.kpi.fail30 ?? "-"}
          tone="rose"
        />
        <Card label="30日 成功率" value={successRateText} tone="sky" />
      </div>

      {/* フィルタ */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap items-center gap-2">
          {(
            ["mynavi", "doda", "type", "wtype", "rikunabi", "en"] as Site[]
          ).map((s) => {
            const selected = sites.includes(s);
            return (
              <button
                key={s}
                onClick={() =>
                  setSites((prev) =>
                    selected ? prev.filter((x) => x !== s) : [...prev, s]
                  )
                }
                className={`rounded-lg px-2 py-1 text-xs ${
                  selected
                    ? "border border-indigo-400 text-indigo-700"
                    : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {SITE_LABEL[s]}
              </button>
            );
          })}
        </div>

        <div className="inline-flex items-center gap-1">
          {(["1m", "1y", "3y"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-2 py-1 text-xs ${
                p === period
                  ? "border border-neutral-400 text-neutral-800"
                  : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              {p === "1m" ? "1ヶ月" : p === "1y" ? "1年" : "3年"}
            </button>
          ))}
        </div>
      </div>

      {/* グラフ */}
      <section className="mb-4 rounded-2xl border border-neutral-200 p-4">
        <div className="mb-2 text-sm text-neutral-700">
          月次推移：<span className="font-semibold">{totalsText}</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics?.series ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="postings"
                name="求人数"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="seekers"
                name="求職者数"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 表（同じデータを表形式で） */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left">年月</th>
              <th className="px-3 py-2 text-right">求人数</th>
              <th className="px-3 py-2 text-right">求職者数</th>
            </tr>
          </thead>
          <tbody>
            {(metrics?.series ?? []).map((r) => (
              <tr key={r.month} className="border-t">
                <td className="px-3 py-2">{r.month}</td>
                <td className="px-3 py-2 text-right">
                  {r.postings.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.seekers.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 直近20件 + 詳細リンク */}
      <section className="rounded-2xl border border-neutral-200 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-base font-semibold text-neutral-800">
            直近の取得状況（20件）
          </div>
          <Link
            href="/job-boards/runs"
            className="text-sm text-indigo-700 underline-offset-2 hover:underline"
          >
            取得状況の一覧（詳細）
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-700">
              <tr>
                <th className="px-3 py-2 text-left">サイト</th>
                <th className="px-3 py-2 text-left">ステータス</th>
                <th className="px-3 py-2 text-left">開始</th>
                <th className="px-3 py-2 text-left">終了</th>
                <th className="px-3 py-2 text-left">備考</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.latest ?? []).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    {SITE_LABEL[r.site as Site] ?? r.site}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.status === "success"
                          ? "text-emerald-600"
                          : r.status === "failed"
                          ? "text-rose-600"
                          : "text-neutral-700"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {r.finished_at
                      ? new Date(r.finished_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {msg && (
        <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-500">
          {msg}
        </pre>
      )}
    </main>
  );
}

function Card({
  label,
  value,
  tone = "indigo",
}: {
  label: string;
  value: string | number;
  tone?: "indigo" | "emerald" | "rose" | "sky";
}) {
  const ring =
    tone === "emerald"
      ? "ring-emerald-100"
      : tone === "rose"
      ? "ring-rose-100"
      : tone === "sky"
      ? "ring-sky-100"
      : "ring-indigo-100";
  return (
    <div
      className={`rounded-2xl border border-neutral-200 p-4 shadow-sm ring-1 ${ring}`}
    >
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-neutral-900">{value}</div>
    </div>
  );
}
