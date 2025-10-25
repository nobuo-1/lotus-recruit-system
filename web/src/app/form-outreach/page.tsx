// web/src/app/form-outreach/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import KpiCard from "@/components/KpiCard";
import Link from "next/link";

export default function FormOutreachTop() {
  const [kpi, setKpi] = useState<{
    tplCount: number;
    prospectCount: number;
    sentThisMonth: number;
    allSent: number;
  } | null>(null);
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

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-500">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
