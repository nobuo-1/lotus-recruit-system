// web/src/app/job-boards/runs/page.tsx
import React from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatJpDateTime } from "@/lib/formatDate";
import { SHARED_RESEARCH_TENANT_ID } from "@/server/job-boards/sharedResearch";

export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  site: string | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};

export default async function JobBoardRuns() {
  const sb = supabaseAdmin();

  // 直近20件
  let rows: RunRow[] = [];
  try {
    const { data } = await sb
      .from("job_board_runs")
      .select("id, site, status, started_at, finished_at, error")
      .eq("tenant_id", SHARED_RESEARCH_TENANT_ID)
      .order("started_at", { ascending: false })
      .limit(20)
      .returns<RunRow[]>();
    rows = data ?? [];
  } catch {}

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              自動実行履歴
            </h1>
            <p className="text-sm text-neutral-500">
              毎月1日に実行する求人件数取得の履歴を確認します。
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/job-boards/runs/settings"
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800"
            >
              自動実行設定
            </Link>
            <Link
              href="/job-boards/runs/all"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              一覧（ページング）
            </Link>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700 shadow-sm">
          <div className="font-semibold text-neutral-900">実行予定</div>
          <div className="mt-1">
            毎月1日に、各職種小分類別かつ各都道府県別で求人件数を取得し、リサーチトップのグラフに保存します。
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">対象</th>
                <th className="px-3 py-3 text-left">開始</th>
                <th className="px-3 py-3 text-left">終了</th>
                <th className="px-3 py-3 text-left">ステータス</th>
                <th className="px-3 py-3 text-left">結果</th>
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
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs ${
                        r.status === "success"
                          ? "bg-emerald-50 text-emerald-700"
                          : r.status === "failed"
                            ? "bg-red-50 text-red-700"
                            : r.status === "partial"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {r.status ?? "-"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
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
                    まだ実行履歴がありません
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
