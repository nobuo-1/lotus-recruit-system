// web/src/app/job-boards/destinations/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

type Dest = {
  id: string;
  name: string;
  type: string;
  value: string;
  enabled: boolean;
};

export default function Destinations() {
  const [rows, setRows] = useState<Dest[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/job-boards/destinations", {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) return setMsg(j?.error || "fetch failed");
      setRows(j.rows || []);
    })();
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">
            送り先一覧
          </h1>
          <Link
            href="/job-boards/destinations/new"
            className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            送り先を追加
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[780px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">種別</th>
                <th className="px-3 py-3 text-left">値</th>
                <th className="px-3 py-3 text-left">有効</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">{r.name}</td>
                  <td className="px-3 py-3">{r.type}</td>
                  <td className="px-3 py-3">{r.value}</td>
                  <td className="px-3 py-3">{r.enabled ? "ON" : "OFF"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    送り先がありません
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
