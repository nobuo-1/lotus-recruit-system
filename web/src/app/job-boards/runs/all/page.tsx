// web/src/app/job-boards/runs/all/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { formatJpDateTime } from "@/lib/formatDate";

type RunRow = {
  id: string;
  site: string | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};

export default function JobBoardRunsAll() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/job-boards/runs?page=${page}`, {
        cache: "no-store",
      });
      const j = await res.json();
      setRows(j?.rows ?? []);
    })();
  }, [page]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">
            実行状況（一覧）
          </h1>
          <p className="text-sm text-neutral-500">40件ごとにページ切替</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">開始</th>
                <th className="px-3 py-3 text-left">終了</th>
                <th className="px-3 py-3 text-left">ステータス</th>
                <th className="px-3 py-3 text-left">エラー</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{r.site ?? "-"}</td>
                  <td className="px-3 py-2">
                    {formatJpDateTime(r.started_at)}
                  </td>
                  <td className="px-3 py-2">
                    {formatJpDateTime(r.finished_at)}
                  </td>
                  <td className="px-3 py-2">{r.status ?? "-"}</td>
                  <td className="px-3 py-2">
                    {r.error ? (
                      <span className="text-red-600">{r.error}</span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            前へ
          </button>
          <span className="text-sm text-neutral-600">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            次へ
          </button>
        </div>
      </main>
    </>
  );
}
