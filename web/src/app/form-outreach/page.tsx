// web/src/app/form-outreach/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

type SeriesPoint = { date: string; count: number };
type Summary = {
  templates: number;
  companies: number;
  allTimeRuns: number;
  successRate: number; // %
  series: {
    all: SeriesPoint[]; // すべて（正規 + 不備 + 近似）
    prospects: SeriesPoint[]; // 正規企業リスト数（form_prospects）
    rejected: SeriesPoint[]; // 不備企業リスト数（form_prospects_rejected）
    similar: SeriesPoint[]; // 近似サイトリスト数（form_similar_sites）
  };
};

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";
type Mode = "all" | "prospects" | "rejected" | "similar";

// /api/me/tenant からテナントIDを取得（schedules と同じロジック）
async function fetchTenantId(): Promise<string | null> {
  try {
    let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
    if (!meRes.ok) {
      meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
    }
    const me = await meRes.json().catch(() => ({}));
    return me?.tenant_id ?? me?.profile?.tenant_id ?? null;
  } catch {
    return null;
  }
}

// API応答をどの形でも受け取れるように正規化
function normalizeSummary(raw: any): Summary | null {
  if (!raw) return null;
  const root = raw.metrics ?? raw.data ?? raw;

  const n = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const arr = (v: any) => (Array.isArray(v) ? v : []);

  const series = root.series ?? {};
  const all = arr(series.all);
  const prospects = arr(series.prospects);
  const rejected = arr(series.rejected);
  const similar = arr(series.similar);

  // date/count の最低限ガード
  const fix = (xs: any[]): SeriesPoint[] =>
    xs
      .map((x) => ({
        date: String(x?.date ?? x?.d ?? ""),
        count: n(x?.count ?? x?.value ?? 0),
      }))
      .filter((x) => x.date);

  return {
    templates: n(root.templates),
    companies: n(root.companies),
    allTimeRuns: n(root.allTimeRuns),
    successRate: n(root.successRate),
    series: {
      all: fix(all),
      prospects: fix(prospects),
      rejected: fix(rejected),
      similar: fix(similar),
    },
  };
}

export default function FormOutreachLanding() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [range, setRange] = useState<RangeKey>("14d");
  const [mode, setMode] = useState<Mode>("all");
  const [msg, setMsg] = useState("");

  // ① テナントID取得
  useEffect(() => {
    (async () => {
      const t = await fetchTenantId();
      setTenantId(t);
    })();
  }, []);

  // ② テナントID + range で KPI を取得
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        setMsg("");
        const res = await fetch(`/api/form-outreach/summary?range=${range}`, {
          cache: "no-store",
          headers: { "x-tenant-id": tenantId },
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(j?.error || "summary fetch failed");
        }
        const normalized = normalizeSummary(j);
        if (!normalized) throw new Error("summary is empty");
        setData(normalized);
      } catch (e: any) {
        setMsg(String(e?.message || e));
        setData(null);
      }
    })();
  }, [range, tenantId]);

  // グラフ用シリーズ（モードに応じた1本）
  const series = useMemo(() => {
    if (!data) return [];
    switch (mode) {
      case "prospects":
        return data.series.prospects;
      case "rejected":
        return data.series.rejected;
      case "similar":
        return data.series.similar;
      case "all":
      default:
        return data.series.all;
    }
  }, [data, mode]);

  const periodTotal = useMemo(
    () => series.reduce((s, p) => s + (p.count || 0), 0),
    [series]
  );

  const fmtPct = (n: unknown) => {
    const x = Number(n);
    return Number.isFinite(x) ? x.toFixed(2) : "0.00";
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル */}
        <div className="mb-4">
          <h1 className="text-[26px] md:text-[24px] font-extrabold tracking-tight text-indigo-900">
            フォーム営業
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            実行・リスト・設定の操作とKPI確認
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
            {/* 実行 */}
            <section>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                実行
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/companies/fetch"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    企業リスト手動取得
                  </Link>
                </li>
                <li>
                  <Link
                    href="/form-outreach/runs/manual"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    メッセージ手動送信
                  </Link>
                </li>
                <li>
                  <Link
                    href="/form-outreach/schedules"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    実行ログ
                  </Link>
                </li>
              </ul>
            </section>

            {/* リスト */}
            <section>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                リスト
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/companies"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    企業リスト
                  </Link>
                </li>
                <li>
                  <Link
                    href="/form-outreach/templates"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    テンプレートリスト
                  </Link>
                </li>
                <li>
                  <Link
                    href="/form-outreach/waitlist"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    待機リスト
                  </Link>
                </li>
              </ul>
            </section>

            {/* 設定 */}
            <section>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                設定
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/settings/filters"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    取得フィルタ設定
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
                <li>
                  <Link
                    href="/form-outreach/senders"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    送信元設定
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* 各KPI */}
        <header className="mb-2">
          <h2 className="text-2xl md:text-[24px] font-semibold text-neutral-900">
            各KPI
          </h2>
        </header>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <KpiCard label="テンプレ数" value={data?.templates ?? "-"} />
          <KpiCard label="企業数" value={data?.companies ?? "-"} />
          <KpiCard
            label="累計実行（全期間）"
            value={data?.allTimeRuns ?? "-"}
          />
          <KpiCard
            label="成功率（30日）"
            value={`${fmtPct(data?.successRate)}%`}
          />
          <KpiCard label="期間内合計" value={periodTotal} />
        </div>

        {/* 折れ線グラフ（期間/対象切り替え） */}
        <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-base font-semibold text-neutral-800">
              直近{labelOf(range)}のリスト取得数
            </div>
            <div className="flex flex-wrap gap-2">
              {/* 期間 */}
              <div className="inline-flex items-center gap-1">
                {(["7d", "14d", "1m", "3m", "6m", "1y"] as RangeKey[]).map(
                  (r) => (
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
                  )
                )}
              </div>
              {/* 対象（4種類） */}
              <div className="inline-flex items-center gap-1">
                {(["all", "prospects", "rejected", "similar"] as Mode[]).map(
                  (m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-lg px-2 py-1 text-xs ${
                        mode === m
                          ? "border border-indigo-400 text-indigo-700"
                          : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                      }`}
                    >
                      {m === "all"
                        ? "すべて"
                        : m === "prospects"
                        ? "正規企業"
                        : m === "rejected"
                        ? "不備企業"
                        : "近似サイト"}
                    </button>
                  )
                )}
              </div>
            </div>
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
