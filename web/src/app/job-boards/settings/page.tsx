// web/src/app/job-boards/settings/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import Toggle from "@/components/Toggle";

type Rule = {
  id: string;
  name: string | null;
  email: string | null;
  sites: string[] | null;
  age_bands: string[] | null;
  employment_types: string[] | null;
  salary_bands: string[] | null;
  enabled: boolean;
  schedule_type: string | null;
  schedule_time: string | null;
  schedule_days: number[] | null;
  timezone: string | null;
  created_at: string | null;
};

export default function NotifySettings() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const r = await fetch("/api/job-boards/notify-rules", {
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
    const r = await fetch("/api/job-boards/notify-rules", {
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
    const r = await fetch(`/api/job-boards/notify-rules?id=${id}`, {
      method: "DELETE",
    });
    if (!r.ok) return alert("削除に失敗しました");
    setRows((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              通知設定
            </h1>
            <p className="text-sm text-neutral-500">
              サイト/条件での定期通知ルール
            </p>
          </div>
          <Link
            href="/job-boards/settings/new"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            新規通知ルール
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">宛先</th>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">スケジュール</th>
                <th className="px-3 py-3 text-left">有効</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">{r.name || "-"}</td>
                  <td className="px-3 py-3">{r.email || "-"}</td>
                  <td className="px-3 py-3">
                    {(r.sites || []).join(", ") || "-"}
                  </td>
                  <td className="px-3 py-3">
                    {r.schedule_type === "weekly"
                      ? `毎週 ${
                          (r.schedule_days || [])
                            .map((d) => "日月火水木金土"[d])
                            .join("・") || "-"
                        } ${r.schedule_time || ""}`
                      : r.schedule_type === "daily"
                      ? `毎日 ${r.schedule_time || ""}`
                      : "-"}
                  </td>
                  <td className="px-3 py-3">
                    <Toggle
                      checked={!!r.enabled}
                      onChange={(n) => toggle(r.id, n)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/job-boards/settings/new?id=${r.id}`}
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
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-neutral-400"
                    colSpan={6}
                  >
                    通知ルールはありません
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
