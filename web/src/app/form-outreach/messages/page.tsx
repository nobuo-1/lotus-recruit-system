// web/src/app/form-outreach/messages/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Run = {
  id: string;
  flow: string | null;
  status: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export default function MessageLogsPage() {
  const [rows, setRows] = useState<Run[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/runs", {
        headers: { "x-tenant-id": TENANT_ID },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
      setRows([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">送信ログ</h1>
          <p className="text-sm text-neutral-500">
            form_outreach_runs を表示します。
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <table className="min-w-[880px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">ID</th>
                <th className="px-3 py-3 text-left">フロー</th>
                <th className="px-3 py-3 text-left">ステータス</th>
                <th className="px-3 py-3 text-left">開始</th>
                <th className="px-3 py-3 text-left">終了</th>
                <th className="px-3 py-3 text-left">エラー</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50/40">
                  <td className="px-3 py-2">{r.id}</td>
                  <td className="px-3 py-2">{r.flow || "-"}</td>
                  <td className="px-3 py-2">{r.status || "-"}</td>
                  <td className="px-3 py-2">
                    {r.started_at?.replace("T", " ").replace("Z", "") || "-"}
                  </td>
                  <td className="px-3 py-2">
                    {r.finished_at?.replace("T", " ").replace("Z", "") || "-"}
                  </td>
                  <td className="px-3 py-2">
                    <pre className="whitespace-pre-wrap text-xs text-red-600">
                      {r.error || ""}
                    </pre>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    ログがありません
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
