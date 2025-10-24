//web/src/app/form-outreach/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import KpiCard from "@/components/KpiCard";
import Link from "next/link";
import { FileText, Send, Settings, Building2 } from "lucide-react";

type Summary = {
  companies: number;
  templates: number;
  last30: { sent: number; failed: number; queued: number };
};

export default function FormOutreachTop() {
  const [data, setData] = useState<Summary | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/form-outreach/summary", {
          cache: "no-store",
        });
        const j = await res.json();
        setData(j?.metrics ?? null);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-[26px] font-extrabold tracking-tight text-indigo-900">
            フォーム営業
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            企業リスト作成・問い合わせフォーム/メール送信・KPIの確認
          </p>
        </div>

        {/* メニュー */}
        <div className="mb-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <MenuItem
              href="/form-outreach/companies"
              icon={Building2}
              title="法人リスト"
              desc="収集済み法人の一覧・編集"
            />
            <MenuItem
              href="/form-outreach/messages"
              icon={FileText}
              title="メッセージ／シーケンス"
              desc="1通目・2通目…のテンプレ管理"
            />
            <MenuItem
              href="/form-outreach/senders"
              icon={Settings}
              title="送信元設定"
              desc="送信元メール／差出人の設定"
            />
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="法人リスト総数" value={data?.companies ?? "-"} />
          <KpiCard label="テンプレ数" value={data?.templates ?? "-"} />
          <KpiCard label="直近30日 送信成功" value={data?.last30.sent ?? "-"} />
          <KpiCard label="直近30日 失敗" value={data?.last30.failed ?? "-"} />
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

function MenuItem({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: any;
  title: string;
  desc: string;
}) {
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
