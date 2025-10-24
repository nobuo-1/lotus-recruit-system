// web/src/app/form-outreach/runs/Client.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

type Flow = "crawl" | "send" | "followup";

type Item = {
  id: string;
  flow: Flow;
  status: string;
  error?: string | null;
  started_at: string;
  finished_at?: string | null;
};

type Resp = {
  ok: boolean;
  items: Item[];
  paging: {
    page: number;
    limit: number;
    total: number;
    hasPrev: boolean;
    hasNext: boolean;
  };
};

const FLOWS: Flow[] = ["crawl", "send", "followup"];
const labels: Record<Flow, string> = {
  crawl: "法人リストアップ",
  send: "一次連絡",
  followup: "追い連絡",
};

export default function RunsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const flow = ((sp.get("flow") as Flow) || "crawl") as Flow;
  const page = Math.max(parseInt(sp.get("page") || "0", 10), 0);

  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(
        `/api/form-outreach/runs?flow=${flow}&limit=40&page=${page}`,
        { cache: "no-store" }
      );
      const j: Resp = await res.json();
      setData(j);
    })();
  }, [flow, page]);

  const total = data?.paging.total ?? 0;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-neutral-900">
          フォーム営業 実行履歴
        </h1>
        <Link
          href="/form-outreach"
          className="text-sm text-indigo-700 underline-offset-2 hover:underline"
        >
          戻る
        </Link>
      </div>

      {/* タブ */}
      <div className="mb-3 flex gap-2">
        {FLOWS.map((f) => (
          <button
            key={f}
            onClick={() => router.push(`/form-outreach/runs?flow=${f}&page=0`)}
            className={`rounded-lg px-3 py-1 text-sm ${
              flow === f
                ? "border border-indigo-400 text-indigo-700"
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {labels[f]}
          </button>
        ))}
      </div>

      <div className="mb-2 text-sm text-neutral-600">全件数：{total}</div>

      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left">フロー</th>
              <th className="px-3 py-2 text-left">ステータス</th>
              <th className="px-3 py-2 text-left">開始</th>
              <th className="px-3 py-2 text-left">終了</th>
              <th className="px-3 py-2 text-left">エラー</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{labels[r.flow]}</td>
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
                <td className="px-3 py-2 text-rose-600">{r.error || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ページング */}
      <div className="mt-3 flex items-center justify-between">
        <button
          disabled={!data?.paging.hasPrev}
          onClick={() =>
            router.push(
              `/form-outreach/runs?flow=${flow}&page=${Math.max(page - 1, 0)}`
            )
          }
          className={`rounded-lg border px-3 py-1 text-sm ${
            data?.paging.hasPrev
              ? "border-neutral-300 hover:bg-neutral-50"
              : "cursor-not-allowed border-neutral-200 text-neutral-400"
          }`}
        >
          前へ
        </button>
        <div className="text-sm text-neutral-600">
          ページ：{page + 1} / {Math.max(Math.ceil(total / 40), 1)}
        </div>
        <button
          disabled={!data?.paging.hasNext}
          onClick={() =>
            router.push(`/form-outreach/runs?flow=${flow}&page=${page + 1}`)
          }
          className={`rounded-lg border px-3 py-1 text-sm ${
            data?.paging.hasNext
              ? "border-neutral-300 hover:bg-neutral-50"
              : "cursor-not-allowed border-neutral-200 text-neutral-400"
          }`}
        >
          次へ
        </button>
      </div>
    </main>
  );
}
