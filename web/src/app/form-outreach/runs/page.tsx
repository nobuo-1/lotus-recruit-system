// web/src/app/form-outreach/runs/page.tsx
import React from "react";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";
import { DataTableCard, PageHero, PageMain, StatChip } from "@/components/PageChrome";

export const dynamic = "force-dynamic";

type RunLite = {
  id: string;
  created_at: string | null;
  kind: string | null; // list, form, email など
  status: string | null; // success, failed, queued
  note: string | null;
};

export default async function OutreachRuns() {
  const sb = await supabaseServer();
  let rows: RunLite[] = [];
  try {
    const { data } = await sb
      .from("form_outreach_runs")
      .select("id, created_at, kind, status, note")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<RunLite[]>();
    rows = data ?? [];
  } catch {}

  return (
    <PageMain className="space-y-6">
      <PageHero
        eyebrow="Run History"
        title="フロー詳細"
        description="直近 20 件のフォーム営業実行を見やすくまとめています。より長い履歴は一覧ページに移動して確認できます。"
        accent="rose"
        actions={[
          { href: "/form-outreach/runs/all", label: "一覧（ページング）", variant: "secondary" },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatChip label="表示件数" value={rows.length} />
        <StatChip label="対象" value="直近20件" />
        <StatChip label="最終行" value={rows[0]?.created_at ? formatJpDateTime(rows[0].created_at) : "-"} />
      </div>

      <DataTableCard>
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-sm">
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
                  <td className="px-3 py-2">
                    {formatJpDateTime(r.created_at)}
                  </td>
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
                    履歴がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DataTableCard>
    </PageMain>
  );
}
