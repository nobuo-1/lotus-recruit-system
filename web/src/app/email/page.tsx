// web/src/app/email/page.tsx
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
import { Settings, Mail, Megaphone } from "lucide-react";

type SeriesPoint = { date: string; count: number };

type Summary = {
  campaignCount: number;
  // 追加: メール総数
  mailCount?: number;
  sent30: number;
  reachRate: number; // %
  openRate: number; // %
  unsub30: number;
  series: SeriesPoint[];

  // 任意（存在すれば使用）
  sent30Mail?: number;
  sent30Campaign?: number;
  reachRateMail?: number;
  reachRateCampaign?: number;
  openRateMail?: number;
  openRateCampaign?: number;
  seriesMail?: SeriesPoint[];
  seriesCampaign?: SeriesPoint[];
};

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";
type StreamKey = "all" | "mail" | "campaign";

export default function EmailLanding() {
  const [data, setData] = useState<Summary | null>(null);
  const [range, setRange] = useState<RangeKey>("14d");
  const [stream, setStream] = useState<StreamKey>("all");
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

  // 合計KPI
  const reachTotal =
    typeof data?.reachRate === "number" ? `${data.reachRate}%` : "-";
  const openTotal =
    typeof data?.openRate === "number" ? `${data.openRate}%` : "-";

  // 内訳
  const sentMail = (data as any)?.sent30Mail ?? (data as any)?.mailSent30;
  const sentCamp =
    (data as any)?.sent30Campaign ?? (data as any)?.campaignSent30;
  const sentTotal =
    typeof sentMail === "number" && typeof sentCamp === "number"
      ? sentMail + sentCamp
      : data?.sent30;

  const reachMail =
    typeof (data as any)?.reachRateMail === "number"
      ? `${(data as any).reachRateMail}%`
      : undefined;
  const reachCamp =
    typeof (data as any)?.reachRateCampaign === "number"
      ? `${(data as any).reachRateCampaign}%`
      : undefined;
  const openMail =
    typeof (data as any)?.openRateMail === "number"
      ? `${(data as any).openRateMail}%`
      : undefined;
  const openCamp =
    typeof (data as any)?.openRateCampaign === "number"
      ? `${(data as any).openRateCampaign}%`
      : undefined;

  // グラフデータ
  const seriesAll = data?.series ?? [];
  const seriesMail =
    (data as any)?.seriesMail ?? (data as any)?.mailSeries ?? [];
  const seriesCamp =
    (data as any)?.seriesCampaign ?? (data as any)?.campaignSeries ?? [];

  let chosen: SeriesPoint[] =
    stream === "mail"
      ? seriesMail
      : stream === "campaign"
      ? seriesCamp
      : seriesAll;
  // フォールバック：空配列なら合計を表示（“押しても出ない”対策）
  if (!chosen || chosen.length === 0) chosen = seriesAll;

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        {/* タイトル：機能メニューと同サイズ／少し紺色 */}
        <div className="mb-4">
          <h1 className="text-2xl md:text-[24px] font-semibold tracking-tight text-[#1e2a44]">
            メール配信
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            メール/キャンペーンの作成・配信とKPIの確認
          </p>
        </div>

        {/* 機能メニュー */}
        <header className="mb-3">
          <h2 className="text-2xl md:text-[24px] font-semibold text-neutral-900">
            機能メニュー
          </h2>
        </header>

        <div className="mb-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Mail className="h-5 w-5 text-neutral-700" />
                <h3 className="text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                  メール
                </h3>
              </div>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/mails/new"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    新規メール
                  </Link>
                </li>
                <li>
                  <Link
                    href="/mails"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    メール一覧
                  </Link>
                </li>
                <li>
                  <Link
                    href="/mails/schedules"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    メール予約リスト
                  </Link>
                </li>
              </ul>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-neutral-700" />
                <h3 className="text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                  キャンペーン
                </h3>
              </div>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/campaigns/new"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    新規キャンペーン
                  </Link>
                </li>
                <li>
                  <Link
                    href="/campaigns"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    キャンペーン一覧
                  </Link>
                </li>
                <li>
                  <Link
                    href="/email/schedules"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    キャンペーン予約リスト
                  </Link>
                </li>
              </ul>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <Settings className="h-5 w-5 text-neutral-700" />
                <h3 className="text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">
                  その他
                </h3>
              </div>
              <ul className="mt-1.5 space-y-1.5">
                <li>
                  <Link
                    href="/recipients"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    受信者リスト
                  </Link>
                </li>
                <li>
                  <Link
                    href="/email/settings"
                    className="text-base text-neutral-800 underline-offset-2 hover:underline"
                  >
                    メール用設定
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

        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          {/* ★ 先頭にメール総数 */}
          <KpiCard label="メール総数" value={(data as any)?.mailCount ?? "-"} />
          <KpiCard
            label="キャンペーン総数"
            value={data?.campaignCount ?? "-"}
          />

          {/* 合計系 */}
          <KpiCard label="直近30日の配信数(合計)" value={sentTotal ?? "-"} />
          <KpiCard label="メール到達率(合計)" value={reachTotal} />
          <KpiCard label="メール開封率(合計)" value={openTotal} />
          <KpiCard label="配信停止数(30日)" value={data?.unsub30 ?? "-"} />

          {/* 内訳（存在すれば表示） */}
          {typeof sentMail === "number" && (
            <KpiCard label="メール配信数(30日)" value={sentMail} />
          )}
          {typeof sentCamp === "number" && (
            <KpiCard label="キャンペーン配信数(30日)" value={sentCamp} />
          )}
          {reachMail && <KpiCard label="メール到達率" value={reachMail} />}
          {reachCamp && (
            <KpiCard label="キャンペーン到達率" value={reachCamp} />
          )}
          {openMail && <KpiCard label="メール開封率" value={openMail} />}
          {openCamp && <KpiCard label="キャンペーン開封率" value={openCamp} />}
        </div>

        {/* 折れ線グラフ */}
        <ChartBlock
          range={range}
          setRange={setRange}
          stream={stream}
          setStream={setStream}
          series={chosen}
        />

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
  stream,
  setStream,
  series,
}: {
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  stream: "all" | "mail" | "campaign";
  setStream: (s: "all" | "mail" | "campaign") => void;
  series: { date: string; count: number }[];
}) {
  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* 太字に */}
        <div className="text-base font-semibold text-neutral-800">
          直近{labelOf(range)}の配信数
        </div>

        {/* 切替UI：グループを分け、区切り線で視覚分離 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
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

          {/* 区切り */}
          <span className="hidden h-5 w-px bg-neutral-200 sm:inline-block mx-1" />

          <div className="flex gap-1">
            {(["all", "mail", "campaign"] as StreamKey[]).map((s) => (
              <button
                key={s}
                onClick={() => setStream(s)}
                className={`rounded-lg px-2 py-1 text-xs ${
                  stream === s
                    ? "border border-neutral-400 text-neutral-800"
                    : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {s === "all"
                  ? "合計"
                  : s === "mail"
                  ? "メール"
                  : "キャンペーン"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series ?? []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 13 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="count"
              name="配信数"
              dot={false}
              strokeWidth={2.4}
            />
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
