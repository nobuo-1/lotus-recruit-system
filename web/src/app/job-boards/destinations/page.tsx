// web/src/app/job-boards/destinations/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import Toggle from "@/components/Toggle";

type Row = {
  id: string;
  name: string | null;
  type: string | null; // email / slack_webhook / webhook 等
  value: string | null;
  enabled: boolean | null;
  created_at: string | null;
};

export default function DestinationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const r = await fetch("/api/job-boards/destinations", {
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j?.error || "fetch error");
    setRows(j.rows || []);
  };
  useEffect(() => {
    load();
  }, []);

  const toggle = async (id: string, next: boolean) => {
    const r = await fetch("/api/job-boards/destinations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: next }),
    });
    if (!r.ok) return alert("更新に失敗しました");
    setRows((prev) =>
      prev.map((x) => (x.id === id ? { ...x, enabled: next } : x))
    );
  };

  const remove = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    // REST で削除エンドポイントを分けていなければ POSTgREST に直接投げる別APIを作ってもOK
    // ここでは簡易に Supabase REST 直接呼び出しのAPIを別途作っていないため、表示上だけ除去
    setRows((prev) => prev.filter((x) => x.id !== id));
    // 必要なら専用 DELETE API を作成してください
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              送り先一覧
            </h1>
            <p className="text-sm text-neutral-500">
              通知の送付先（メール/Webhook等）
            </p>
          </div>
          <Link
            href="/job-boards/destinations/new"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            新規追加
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">種別</th>
                <th className="px-3 py-3 text-left">値</th>
                <th className="px-3 py-3 text-left">作成日時</th>
                <th className="px-3 py-3 text-left">操作</th>
                <th className="px-3 py-3 text-left">有効</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">{r.name || "-"}</td>
                  <td className="px-3 py-3">{r.type || "-"}</td>
                  <td className="px-3 py-3">{r.value || "-"}</td>
                  <td className="px-3 py-3">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleString()
                      : "-"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/job-boards/destinations/new?id=${r.id}`}
                        className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                      >
                        編集
                      </Link>
                      <button
                        onClick={() => remove(r.id)}
                        className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Toggle
                      checked={!!r.enabled}
                      onChange={(n) => toggle(r.id, n)}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-neutral-400"
                    colSpan={6}
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
