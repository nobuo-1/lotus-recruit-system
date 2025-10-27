// web/src/app/job-boards/destinations/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import Toggle from "@/components/Toggle";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Dest = {
  id: string;
  name: string;
  type: string;
  value: string;
  enabled: boolean;
  created_at: string;
};

export default function DestinationsPage() {
  const [rows, setRows] = useState<Dest[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("");
    try {
      const r = await fetch("/api/job-boards/destinations", {
        headers: { "x-tenant-id": TENANT_ID },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (id: string, next: boolean) => {
    await fetch("/api/job-boards/destinations", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": TENANT_ID,
      },
      body: JSON.stringify({ id, patch: { enabled: next } }),
    }).then((r) => r.json().catch(() => ({})));
    load();
  };

  const del = async (id: string) => {
    if (!confirm("削除します。よろしいですか？")) return;
    await fetch("/api/job-boards/destinations", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": TENANT_ID,
      },
      body: JSON.stringify({ id }),
    }).then((r) => r.json().catch(() => ({})));
    load();
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">
            送り先一覧
          </h1>
          <Link
            href="/job-boards/destinations/new"
            className="rounded-lg border border-neutral-200 px-3 py-2 hover:bg-neutral-50 text-sm"
          >
            新規追加
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[800px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">タイプ</th>
                <th className="px-3 py-3 text-left">値</th>
                <th className="px-3 py-3 text-left w-24">操作</th>
                <th className="px-3 py-3 text-left w-24">有効</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">{d.name}</td>
                  <td className="px-3 py-3">{d.type}</td>
                  <td className="px-3 py-3">{d.value}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        title="編集"
                        className="inline-flex rounded-md border border-neutral-300 p-1 hover:bg-neutral-50"
                        href={`/job-boards/destinations/new?edit=${d.id}`}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 20 20"
                          fill="none"
                        >
                          <path
                            d="M4 13.5V16h2.5L15 7.5 12.5 5 4 13.5z"
                            fill="#374151"
                          />
                        </svg>
                      </Link>
                      <button
                        title="削除"
                        onClick={() => del(d.id)}
                        className="inline-flex rounded-md border border-neutral-300 p-1 hover:bg-neutral-50"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 20 20"
                          fill="none"
                        >
                          <path
                            d="M6 7h8l-1 9H7L6 7zm1-2h6l1 1H6l1-1z"
                            fill="#374151"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Toggle
                      checked={d.enabled}
                      onChange={(n) => toggle(d.id, n)}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
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
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
