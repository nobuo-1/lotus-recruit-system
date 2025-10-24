// web/src/app/job-boards/runs/page.tsx
"use client";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import React, { Suspense, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

type Item = {
  id: string;
  site: string;
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

export default function Page() {
  return (
    <>
      <AppHeader />
      {/* Suspense で useSearchParams を包む */}
      <Suspense fallback={<PageSkeleton />}>
        <RunsInner />
      </Suspense>
    </>
  );
}

function RunsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const page = Math.max(parseInt(sp.get("page") || "0", 10), 0);

  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/job-boards/runs?limit=40&page=${page}`, {
        cache: "no-store",
      });
      const j: Resp = await res.json();
      setData(j);
    })();
  }, [page]);

  const total = data?.paging.total ?? 0;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-neutral-900">
          取得状況 一覧
        </h1>
        <Link
          href="/job-boards"
          className="text-sm text-indigo-700 underline-offset-2 hover:underline"
        >
          戻る
        </Link>
      </div>

      <div className="mb-2 text-sm text-neutral-600">全件数：{total}</div>

      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left">サイト</th>
              <th className="px-3 py-2 text-left">ステータス</th>
              <th className="px-3 py-2 text-left">開始</th>
              <th className="px-3 py-2 text-left">終了</th>
              <th className="px-3 py-2 text-left">エラー</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-mono text-neutral-700">
                  {r.site}
                </td>
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
            router.push(`/job-boards/runs?page=${Math.max(page - 1, 0)}`)
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
          onClick={() => router.push(`/job-boards/runs?page=${page + 1}`)}
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

function PageSkeleton() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 h-6 w-60 animate-pulse rounded bg-neutral-200" />
      <div className="mb-3 h-8 w-full animate-pulse rounded bg-neutral-100" />
      <div className="h-64 w-full animate-pulse rounded-lg border border-neutral-200 bg-neutral-50" />
    </main>
  );
}
