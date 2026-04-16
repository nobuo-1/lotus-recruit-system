// web/src/app/email/page.tsx
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
  BookUser,
  CalendarClock,
  FileClock,
  Files,
  MailPlus,
  Megaphone,
} from "lucide-react";

type SeriesPoint = { date: string; count: number };
type Summary = {
  mailTotal: number;
  campaignTotal: number;
  allTimeSends: number;
  reachRate: number; // %
  openRate: number; // %
  series: {
    total: SeriesPoint[];
    mail: SeriesPoint[];
    campaign: SeriesPoint[];
  };
};

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";
type Mode = "total" | "mail" | "campaign";

export default function EmailLanding() {
  const [data, setData] = useState<Summary | null>(null);
  const [range, setRange] = useState<RangeKey>("14d");
  const [mode, setMode] = useState<Mode>("total");
  const [msg, setMsg] = useState("");

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

  const series = useMemo(() => {
    if (!data) return [];
    if (mode === "mail") return data.series.mail;
    if (mode === "campaign") return data.series.campaign;
    return data.series.total;
  }, [data, mode]);

  const periodTotal = useMemo(
    () => series.reduce((s, p) => s + (p.count || 0), 0),
    [series]
  );

  // ▼ 小数点第2位までのパーセント表示
  const fmtPct = (n: unknown) => {
    const x = Number(n);
    return Number.isFinite(x) ? x.toFixed(2) : "0.00";
  };
  const reachText = `${fmtPct(data?.reachRate)}%`;
  const openText = `${fmtPct(data?.openRate)}%`;

  return (
    <>
      <AppHeader />
      <PageMain className="space-y-6">
        <PageHero
          eyebrow="Mail Workspace"
          title="メール配信の運用導線をひとつの画面で管理"
          description="メール、キャンペーン、受信者、配信設定までを横断して進められる構成に刷新しました。左サイドバーの階層と同じ考え方で、日々の作業をカードからすぐ実行できます。"
          accent="blue"
          actions={[
            { href: "/mails/new", label: "新規メール", variant: "primary" },
            { href: "/campaigns/new", label: "新規キャンペーン", variant: "secondary" },
          ]}
        />

        <SurfaceCard>
          <SectionTitle
            title="すぐ使う操作"
            description="日次の配信業務で頻度の高い画面をまとめています。"
          />
          <ActionGrid
            columns="three"
            items={[
              {
                href: "/mails/new",
                title: "メールを新規作成",
                description: "単発配信の本文・件名をすぐ作成します。",
                icon: MailPlus,
              },
              {
                href: "/mails",
                title: "メール一覧",
                description: "下書き、送信済み、予約中のメールをまとめて確認します。",
                icon: Files,
              },
              {
                href: "/mails/schedules",
                title: "メール予約一覧",
                description: "予約中の配信を確認し、直前の見直しに使います。",
                icon: FileClock,
              },
              {
                href: "/campaigns/new",
                title: "キャンペーンを作成",
                description: "段階配信や継続接触の流れを新規で設定します。",
                icon: CalendarClock,
              },
              {
                href: "/campaigns",
                title: "キャンペーン一覧",
                description: "配信中の施策と過去のキャンペーン結果を見直します。",
                icon: Megaphone,
              },
              {
                href: "/recipients",
                title: "受信者管理",
                description: "配信対象の追加、整理、配信停止の管理を行います。",
                icon: BookUser,
              },
            ]}
          />
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle
            title="KPI"
            description="直近の配信状況と全体のボリュームをまとめて確認できます。"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <KpiCard
              label="メール総数"
              value={data?.mailTotal ?? "-"}
              className="md:col-span-2"
            />
            <KpiCard label="キャンペーン総数" value={data?.campaignTotal ?? "-"} />
            <KpiCard label="累計配信数" value={data?.allTimeSends ?? "-"} />
            <KpiCard label="メール到達率（30日）" value={reachText} />
            <KpiCard label="メール開封率（30日）" value={openText} />
          </div>
        </SurfaceCard>

        <ChartBlock
          range={range}
          setRange={setRange}
          mode={mode}
          setMode={setMode}
          series={series}
          periodTotal={periodTotal}
        />

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-500">
            {msg}
          </pre>
        )}
      </PageMain>
    </>
  );
}

function ChartBlock({
  range,
  setRange,
  mode,
  setMode,
  series,
  periodTotal,
}: {
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  mode: "total" | "mail" | "campaign";
  setMode: (m: "total" | "mail" | "campaign") => void;
  series: { date: string; count: number }[];
  periodTotal: number;
}) {
  const modeLabel =
    mode === "total" ? "合計" : mode === "mail" ? "メール" : "キャンペーン";

  return (
    <SurfaceCard>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xl font-semibold tracking-tight text-neutral-950">
            直近{labelOf(range)}の配信数
          </div>
          <div className="mt-1 text-sm text-neutral-500">
            表示対象を切り替えながら、期間内の推移を比較できます。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
            {(["7d", "14d", "1m", "3m", "6m", "1y"] as RangeKey[]).map((r) => (
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
            ))}
          </div>
          <div className="inline-flex items-center gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
            {(["total", "mail", "campaign"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                  mode === m
                    ? "bg-white text-neutral-950 shadow-sm"
                    : "text-neutral-500 hover:bg-white/70"
                }`}
              >
                {m === "total"
                  ? "合計"
                  : m === "mail"
                  ? "メール"
                  : "キャンペーン"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 text-sm text-neutral-600">
        {modeLabel}の期間内総配信数：
        <span className="ml-1 font-semibold text-neutral-950">{periodTotal}</span>
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
