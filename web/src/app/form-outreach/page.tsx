// web/src/app/form-outreach/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import KpiCard from "@/components/KpiCard";
import AppHeader from "@/components/AppHeader";
import {
  ActionGrid,
  PageHero,
  PageMain,
  SectionTitle,
  SurfaceCard,
} from "@/components/PageChrome";
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
  Boxes,
  FileClock,
  FileSearch,
  MessageSquareText,
  Send,
  Settings2,
} from "lucide-react";

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
      <PageMain className="space-y-6">
        <PageHero
          eyebrow="Form Outreach"
          title="企業抽出から送信、自動化まで一続きで運用"
          description="フォーム営業の実行、テンプレート管理、取得条件、待機リストを同じ設計で整理しました。右往左往せず、作業の入口を明確にしています。"
          accent="green"
          actions={[
            { href: "/form-outreach/companies/fetch", label: "企業リストを取得", variant: "primary" },
            { href: "/form-outreach/settings/filters", label: "取得フィルタ設定", variant: "secondary" },
          ]}
        />

        <SurfaceCard>
          <SectionTitle
            title="主要な操作"
            description="日常運用でよく開く画面をカード化しました。"
          />
          <ActionGrid
            items={[
              {
                href: "/form-outreach/companies/fetch",
                title: "企業リスト手動取得",
                description: "対象条件を使って新しい企業リストを抽出します。",
                icon: FileSearch,
              },
              {
                href: "/form-outreach/companies",
                title: "企業リスト",
                description: "送信対象候補を確認し、状態を一覧で見ます。",
                icon: Boxes,
              },
              {
                href: "/form-outreach/form-send",
                title: "フォーム・メール一斉送信",
                description: "企業を手動選択して、フォームまたはメールへ一斉送信します。",
                icon: Send,
              },
              {
                href: "/form-outreach/templates",
                title: "テンプレート管理",
                description: "差し込み文面や営業文をまとめて整備します。",
                icon: MessageSquareText,
              },
              {
                href: "/form-outreach/schedules",
                title: "実行ログ",
                description: "自動・手動のフォーム情報取得ログを確認します。",
                icon: FileClock,
              },
              {
                href: "/form-outreach/senders",
                title: "送信元設定",
                description: "送信元の整備と切り替えを行います。",
                icon: Send,
              },
              {
                href: "/form-outreach/settings/filters",
                title: "取得フィルタ設定",
                description: "企業抽出の条件を精密に管理します。",
                icon: Settings2,
              },
            ]}
          />
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle
            title="KPI"
            description="取得量と実行効率を同じ粒度で確認できます。"
          />
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
        </SurfaceCard>

        <SurfaceCard>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xl font-semibold tracking-tight text-neutral-950">
                直近{labelOf(range)}のリスト取得数
              </div>
              <div className="mt-1 text-sm text-neutral-500">
                取得対象の種類を切り替えながら増減を比較します。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
                {(["7d", "14d", "1m", "3m", "6m", "1y"] as RangeKey[]).map(
                  (r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                        range === r
                          ? "bg-white text-neutral-900 shadow-sm"
                          : "text-neutral-500 hover:bg-white/70"
                      }`}
                    >
                      {labelOf(r)}
                    </button>
                  )
                )}
              </div>
              <div className="inline-flex items-center gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
                {(["all", "prospects", "rejected", "similar"] as Mode[]).map(
                  (m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                        mode === m
                          ? "bg-white text-neutral-950 shadow-sm"
                          : "text-neutral-500 hover:bg-white/70"
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

          <div className="h-64 rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 13, fill: "#737373" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 13, fill: "#737373" }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  dot={false}
                  strokeWidth={3}
                  stroke="#0f172a"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SurfaceCard>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-500">
            {msg}
          </pre>
        )}
      </PageMain>
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
