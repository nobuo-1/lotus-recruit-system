// web/src/app/job-boards/destinations/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Toggle from "@/components/Toggle";
import Link from "next/link";

type Row = {
  id: string;
  tenant_id: string | null;
  created_at: string;
  type: "email" | "webhook";
  name: string;
  value: string;
  enabled: boolean;
};

export default function DestinationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const r = await fetch("/api/job-boards/destinations", {
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j?.error || "load failed");
    setRows(j.rows ?? []);
    setMsg("");
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (id: string, enabled: boolean) => {
    const r = await fetch("/api/job-boards/destinations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j?.error || "toggle failed");
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, enabled } : x)));
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              送り先一覧
            </h1>
            <p className="text-sm text-neutral-500">
              通知の送信先（メール/Webhook）
            </p>
          </div>
          <Link
            href="/job-boards/destinations/new"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            新規追加
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left w-36">有効</th>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">種別</th>
                <th className="px-3 py-3 text-left">宛先/URL</th>
                <th className="px-3 py-3 text-left w-48">作成日時</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-3">
                    <Toggle
                      checked={!!r.enabled}
                      onChange={(v) => toggle(r.id, v)}
                    />
                  </td>
                  <td className="px-3 py-3">{r.name}</td>
                  <td className="px-3 py-3">{r.type}</td>
                  <td className="px-3 py-3">{r.value}</td>
                  <td className="px-3 py-3">
                    {new Date(r.created_at).toLocaleString("ja-JP")}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-neutral-400"
                    colSpan={5}
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
