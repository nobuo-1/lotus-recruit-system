// web/src/app/job-boards/manual/history/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

/** Cookie から tenant_id を読む */
function getTenantIdFromCookie(): string | null {
  try {
    const m = document.cookie.match(
      /(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i
    );
    return m ? decodeURIComponent(m[2]) : null;
  } catch {
    return null;
  }
}

type Row = {
  id: string;
  created_at: string;
  tenant_id: string;
  params: any;
  result_count: number;
};

export default function ManualHistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const tenant = getTenantIdFromCookie();
        const headers: Record<string, string> = {};
        if (tenant) headers["x-tenant-id"] = tenant;

        const r = await fetch("/api/job-boards/manual/history?limit=50", {
          cache: "no-store",
          headers,
        });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error || "fetch failed");
        setRows(j.rows ?? []);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-3">
          手動実行履歴
        </h1>

        <div className="rounded-2xl border border-neutral-200 overflow-x-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">日時</th>
                <th className="px-3 py-3 text-left">対象サイト</th>
                <th className="px-3 py-3 text-left">大分類</th>
                <th className="px-3 py-3 text-left">小分類</th>
                <th className="px-3 py-3 text-left">都道府県</th>
                <th className="px-3 py-3 text-left">結果件数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r) => {
                const p = r.params || {};
                const sites = Array.isArray(p.sites) ? p.sites.join(", ") : "-";
                const L = Array.isArray(p.large) ? p.large.join(", ") : "-";
                const S = Array.isArray(p.small) ? p.small.join(", ") : "-";
                const Pref = Array.isArray(p.pref) ? p.pref.join(", ") : "-";
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.created_at.replace("T", " ").replace("Z", "")}
                    </td>
                    <td className="px-3 py-2">{sites}</td>
                    <td className="px-3 py-2">{L}</td>
                    <td className="px-3 py-2">{S}</td>
                    <td className="px-3 py-2">{Pref}</td>
                    <td className="px-3 py-2">{r.result_count}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    履歴がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
