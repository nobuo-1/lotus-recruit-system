// web/src/app/form-outreach/page.tsx
import React from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import KpiCard from "@/components/KpiCard";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function FormOutreachTop() {
  const sb = await supabaseServer();

  // KPI
  let kpi = { companies: 0, totalMessages: 0, firstTouches: 0, followUps: 0 };
  try {
    const { data } = await sb.rpc("form_outreach_kpis"); // 使えない環境のために下のフォールバックも用意
    if (data) kpi = data as any;
  } catch {
    // フォールバック：単純集計
    const [{ count: c1 }, { count: c2 }, { count: c3 }] = await Promise.all([
      sb.from("form_prospects").select("*", { count: "exact", head: true }),
      sb
        .from("form_outreach_messages")
        .select("*", { count: "exact", head: true }),
      sb
        .from("form_outreach_messages")
        .select("*", { count: "exact", head: true })
        .gte("step", 2),
    ]);
    kpi.companies = c1 ?? 0;
    kpi.totalMessages = c2 ?? 0;
    kpi.firstTouches = (c2 ?? 0) - (c3 ?? 0);
    kpi.followUps = c3 ?? 0;
  }

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              フォーム営業
            </h1>
            <p className="text-sm text-neutral-500">
              法人リストアップ・一次連絡・追い連絡（手動/自動）を管理
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/form-outreach/runs/manual"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              手動実行
            </Link>
            <Link
              href="/form-outreach/runs"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              フロー詳細
            </Link>
            <Link
              href="/form-outreach/automation"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              自動実行設定
            </Link>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="法人リスト数" value={kpi.companies} />
          <KpiCard label="総メッセージ送信数" value={kpi.totalMessages} />
          <KpiCard label="一次連絡数" value={kpi.firstTouches} />
          <KpiCard label="追い連絡数" value={kpi.followUps} />
        </div>

        {/* 設定系メニュー */}
        <div className="mt-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
            <section>
              <h3 className="mb-2 text-lg font-semibold">法人リスト</h3>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/companies"
                    className="text-neutral-800 underline-offset-2 hover:underline"
                  >
                    企業一覧
                  </Link>
                </li>
                <li>
                  <Link
                    href="/form-outreach/runs/manual"
                    className="text-neutral-800 underline-offset-2 hover:underline"
                  >
                    リストアップ（手動）
                  </Link>
                </li>
              </ul>
            </section>
            <section>
              <h3 className="mb-2 text-lg font-semibold">
                メッセージ/シーケンス
              </h3>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/messages"
                    className="text-neutral-800 underline-offset-2 hover:underline"
                  >
                    テンプレート一覧
                  </Link>
                </li>
              </ul>
            </section>
            <section>
              <h3 className="mb-2 text-lg font-semibold">送信元設定</h3>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/form-outreach/senders"
                    className="text-neutral-800 underline-offset-2 hover:underline"
                  >
                    送信元一覧/新規
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
