//web/src/app/form-outreach/schedules/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type RunRow = {
  id: string;
  flow: string | null; // "manual-send" / "auto-send" など想定
  status: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export default function SchedulesPage() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      setMsg("");
      try {
        const r = await fetch("/api/form-outreach/runs", {
          headers: { "x-tenant-id": TENANT_ID },
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "runs fetch failed");
        setRows(j.rows ?? []);
      } catch (e: any) {
        setMsg(String(e?.message || e));
        setRows([]);
      }
    };
    load();
  }, []);

  const runType = (flow: string | null | undefined) => {
    const f = (flow || "").toLowerCase();
    if (f.includes("manual")) return "手動";
    if (f.includes("auto") || f.includes("schedule")) return "自動";
    return "-";
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              実行ログ
            </h1>
            <p className="text-sm text-neutral-500">
              実行履歴を一覧。定期実行の設定は「自動実行設定」から管理します。
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/form-outreach/automation"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              自動実行設定へ
            </Link>
            <Link
              href="/form-outreach/runs/manual"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              手動実行へ
            </Link>
          </div>
        </div>

        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">実行種別</th>
                <th className="px-3 py-3 text-left">フロー</th>
                <th className="px-3 py-3 text-left">状態</th>
                <th className="px-3 py-3 text-left">開始</th>
                <th className="px-3 py-3 text-left">終了</th>
                <th className="px-3 py-3 text-left">エラー</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{runType(r.flow)}</td>
                  <td className="px-3 py-2">{r.flow || "-"}</td>
                  <td className="px-3 py-2">{r.status || "-"}</td>
                  <td className="px-3 py-2">
                    {r.started_at
                      ? r.started_at.replace("T", " ").replace("Z", "")
                      : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {r.finished_at
                      ? r.finished_at.replace("T", " ").replace("Z", "")
                      : "-"}
                  </td>
                  <td className="px-3 py-2">{r.error || "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    直近のログがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
