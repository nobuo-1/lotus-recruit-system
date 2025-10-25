// web/src/app/form-outreach/runs/page.tsx
import React from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";

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
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              フロー詳細
            </h1>
            <p className="text-sm text-neutral-500">
              直近20件を表示。詳細一覧へ移動可。
            </p>
          </div>
          <Link
            href="/form-outreach/runs/all"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            一覧（ページング）
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
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
      </main>
    </>
  );
}
