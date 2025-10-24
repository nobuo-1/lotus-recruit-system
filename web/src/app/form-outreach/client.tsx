"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  MessageSquare,
  Settings,
  PlayCircle,
  ListTree,
  Clock,
} from "lucide-react";

type KPIs = {
  companyCount: number;
  totalMessages: number;
  firstContacts: number;
  followups: number;
};

export default function Client() {
  const [kpi, setKpi] = useState<KPIs>({
    companyCount: 0,
    totalMessages: 0,
    firstContacts: 0,
    followups: 0,
  });
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/form-outreach/summary", {
        cache: "no-store",
      });
      const j = await r.json();
      setKpi(j?.kpi ?? kpi);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-2">
        <h1 className="text-[26px] font-extrabold tracking-tight text-indigo-900">
          フォーム営業
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          法人リスト→一次連絡→追い連絡を自動・手動で運用
        </p>
      </div>

      {/* KPI */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="法人リスト数" value={kpi.companyCount} tone="indigo" />
        <KpiCard
          label="総メッセージ送信数"
          value={kpi.totalMessages}
          tone="sky"
        />
        <KpiCard label="一次連絡数" value={kpi.firstContacts} tone="emerald" />
        <KpiCard label="追い連絡数" value={kpi.followups} tone="rose" />
      </div>

      {/* 大きめカード（ロゴ・アイコン入り） */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <BigCard
          href="/form-outreach/companies"
          title="法人リスト"
          desc="取得・一覧・検索"
          icon={<Building2 size={28} />}
        />
        <BigCard
          href="/form-outreach/messages"
          title="メッセージ / シーケンス"
          desc="一送信目・二送信目などの雛形管理"
          icon={<MessageSquare size={28} />}
        />
        <BigCard
          href="/form-outreach/senders"
          title="送信元設定"
          desc="送信アドレス・署名・Reply-To"
          icon={<Settings size={28} />}
        />
      </div>

      {/* 導線を3分類 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ActionCard
          href="/form-outreach/runs"
          title="手動実行"
          desc="今すぐ実行・履歴の確認"
          icon={<PlayCircle size={24} />}
        />
        <ActionCard
          href="/form-outreach/messages"
          title="フロー詳細"
          desc="文面・置換・ステップ間隔の設定"
          icon={<ListTree size={24} />}
        />
        <ActionCard
          href="/form-outreach/automation"
          title="自動実行設定"
          desc="スケジュールON/OFF・CRON"
          icon={<Clock size={24} />}
        />
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  tone = "indigo",
}: {
  label: string;
  value: number | string;
  tone?: "indigo" | "sky" | "emerald" | "rose";
}) {
  const ring =
    tone === "sky"
      ? "ring-sky-100"
      : tone === "emerald"
      ? "ring-emerald-100"
      : tone === "rose"
      ? "ring-rose-100"
      : "ring-indigo-100";
  return (
    <div
      className={`rounded-2xl border border-neutral-200 p-4 shadow-sm ring-1 ${ring}`}
    >
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-neutral-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
function BigCard({
  href,
  title,
  desc,
  icon,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-neutral-200 p-5 ring-1 ring-indigo-50 transition hover:bg-neutral-50"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-neutral-200 p-3 text-neutral-700 group-hover:text-neutral-900">
          {icon}
        </div>
        <div>
          <div className="text-lg font-semibold text-neutral-900">{title}</div>
          <div className="text-sm text-neutral-500">{desc}</div>
        </div>
      </div>
    </Link>
  );
}
function ActionCard({
  href,
  title,
  desc,
  icon,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-neutral-200 p-5 hover:bg-neutral-50"
    >
      <div className="mb-2 flex items-center gap-2 text-neutral-700 group-hover:text-neutral-900">
        {icon}
        <div className="font-semibold">{title}</div>
      </div>
      <div className="text-sm text-neutral-500">{desc}</div>
    </Link>
  );
}
