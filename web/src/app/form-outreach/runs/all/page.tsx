// web/src/app/form-outreach/runs/all/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { DataTableCard, PageHero, PageMain, StatChip } from "@/components/PageChrome";

type RunLite = {
  id: string;
  created_at: string | null;
  kind: string | null;
  status: string | null;
  note: string | null;
};

export default function OutreachRunsAll() {
  const [rows, setRows] = useState<RunLite[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/form-outreach/runs?page=${page}`, {
        cache: "no-store",
      });
      const j = await res.json();
      setRows(j?.rows ?? []);
    })();
  }, [page]);

  return (
    <PageMain className="space-y-6">
      <PageHero
        eyebrow="Run History"
        title="フロー詳細一覧"
        description="フォーム営業の実行履歴をページ単位でたどれます。最新のログを中心に、過去データも同じレイアウトで確認できます。"
        accent="rose"
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatChip label="ページ" value={page} />
        <StatChip label="表示件数" value={rows.length} />
        <StatChip label="ページサイズ" value="40件" />
      </div>

      <DataTableCard>
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">日時</th>
                <th className="px-3 py-3 text-left">種別</th>
                <th className="px-3 py-3 text-left">ステータス</th>
                <th className="px-3 py-3 text-left">メモ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{r.created_at ?? "-"}</td>
                  <td className="px-3 py-2">{r.kind ?? "-"}</td>
                  <td className="px-3 py-2">{r.status ?? "-"}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {r.note ?? "-"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DataTableCard>

      <div className="flex items-center gap-2">
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
    </PageMain>
  );
}
