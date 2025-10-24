// web/src/app/form-outreach/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import KpiCard from "@/components/KpiCard";
import Link from "next/link";

type RunItem = {
  id: string;
  flow: "crawl" | "send" | "followup";
  status: string;
  error?: string | null;
  started_at: string;
  finished_at?: string | null;
};
type ListResp = { ok: boolean; items: RunItem[]; paging: any };

export default function FormOutreachTop() {
  const [recent, setRecent] = useState<{
    crawl?: RunItem;
    send?: RunItem;
    followup?: RunItem;
  }>({});

  useEffect(() => {
    let t: any;
    const fetchAll = async () => {
      const flows: Array<"crawl" | "send" | "followup"> = [
        "crawl",
        "send",
        "followup",
      ];
      const obj: any = {};
      for (const f of flows) {
        const r = await fetch(
          `/api/form-outreach/runs?flow=${f}&limit=1&page=0`,
          { cache: "no-store" }
        );
        const j: ListResp = await r.json();
        obj[f] = j.items?.[0] || null;
      }
      setRecent(obj);
    };
    fetchAll();
    t = setInterval(fetchAll, 4000); // 4秒ごとに更新（軽量ポーリング）
    return () => clearInterval(t);
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
            3フロー（リストアップ／一次連絡／追い連絡）の実行と可視化
          </p>
        </div>

        {/* メニュー（既存） */}
        <div className="mb-6 rounded-2xl border border-neutral-200 p-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <MenuItem
              href="/form-outreach/companies"
              title="法人リスト"
              desc="収集済み法人の一覧・編集"
            />
            <MenuItem
              href="/form-outreach/messages"
              title="メッセージ／シーケンス"
              desc="1通目・2通目…のテンプレ管理"
            />
            <MenuItem
              href="/form-outreach/senders"
              title="送信元設定"
              desc="送信元メール／差出人の設定"
            />
          </div>
        </div>

        {/* 3フローの手動実行＋直近状況 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FlowCard
            title="① 法人リストアップ"
            flow="crawl"
            recent={recent.crawl}
            onRun={runFlow}
            detailHref="/form-outreach/runs?flow=crawl"
          />
          <FlowCard
            title="② 一次連絡（フォーム/メール）"
            flow="send"
            recent={recent.send}
            onRun={runFlow}
            detailHref="/form-outreach/runs?flow=send"
          />
          <FlowCard
            title="③ 追い連絡（フォローアップ）"
            flow="followup"
            recent={recent.followup}
            onRun={runFlow}
            detailHref="/form-outreach/runs?flow=followup"
          />
        </div>
      </main>
    </>
  );

  async function runFlow(flow: "crawl" | "send" | "followup") {
    try {
      await fetch("/api/form-outreach/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow }),
      });
      alert("実行をキューに追加しました。");
    } catch (e: any) {
      alert(e?.message || "error");
    }
  }
}

function MenuItem({ href, title, desc }: any) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-neutral-200 p-4 transition hover:bg-neutral-50"
    >
      <div className="font-medium text-neutral-900">{title}</div>
      <div className="text-sm text-neutral-500">{desc}</div>
    </Link>
  );
}

function FlowCard({
  title,
  flow,
  recent,
  onRun,
  detailHref,
}: {
  title: string;
  flow: "crawl" | "send" | "followup";
  recent?: RunItem | null;
  onRun: (f: "crawl" | "send" | "followup") => void;
  detailHref: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 p-4">
      <div className="mb-2 text-base font-semibold text-neutral-800">
        {title}
      </div>
      <div className="mb-3 text-sm text-neutral-600">
        直近の実行：{" "}
        {recent ? (
          <>
            <span
              className={
                recent.status === "success"
                  ? "text-emerald-600"
                  : recent.status === "failed"
                  ? "text-rose-600"
                  : "text-neutral-700"
              }
            >
              {recent.status}
            </span>
            <span className="ml-2 text-neutral-500">
              {new Date(recent.started_at).toLocaleString()}
            </span>
            {recent.error ? (
              <span className="ml-2 text-rose-600">{recent.error}</span>
            ) : null}
          </>
        ) : (
          "—"
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onRun(flow)}
          className="rounded-lg border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
        >
          手動実行
        </button>
        <Link
          href={detailHref}
          className="rounded-lg border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
        >
          詳細を見る
        </Link>
        {/* 自動実行設定ページ（後で中身実装） */}
        <Link
          href="/form-outreach/automation"
          className="rounded-lg border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
        >
          自動実行設定
        </Link>
      </div>
    </div>
  );
}
