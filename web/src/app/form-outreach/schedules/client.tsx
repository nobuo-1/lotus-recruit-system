// web/src/app/form-outreach/schedules/client.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Schedule = {
  id: string;
  flow: "crawl" | "send" | "followup";
  cron?: string | null;
  enabled: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
};

export default function Client() {
  const [items, setItems] = useState<Schedule[]>([]);

  const reload = async () => {
    const res = await fetch("/api/form-outreach/schedules", {
      cache: "no-store",
    });
    const j = await res.json();
    setItems(j?.items ?? []);
  };

  useEffect(() => {
    reload();
  }, []);

  const toggle = async (id: string, enabled: boolean) => {
    await fetch("/api/form-outreach/schedules", {
      method: "POST",
      body: JSON.stringify({ id, enabled }),
      headers: { "Content-Type": "application/json" },
    });
    await reload();
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-bold">自動・手動実行設定</h1>
        <Link
          href="/form-outreach"
          className="text-sm text-indigo-700 underline-offset-2 hover:underline"
        >
          戻る
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left">フロー</th>
              <th className="px-3 py-2 text-left">CRON</th>
              <th className="px-3 py-2 text-left">有効</th>
              <th className="px-3 py-2 text-left">最終実行</th>
              <th className="px-3 py-2 text-left">次回予定</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2">{label(s.flow)}</td>
                <td className="px-3 py-2">{s.cron ?? "—"}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggle(s.id, !s.enabled)}
                    className={`rounded-lg px-2 py-1 text-xs ${
                      s.enabled
                        ? "border border-emerald-400 text-emerald-700"
                        : "border border-neutral-200 text-neutral-600"
                    }`}
                  >
                    {s.enabled ? "ON" : "OFF"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  {s.last_run_at
                    ? new Date(s.last_run_at).toLocaleString()
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {s.next_run_at
                    ? new Date(s.next_run_at).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function label(f: "crawl" | "send" | "followup") {
  return f === "crawl"
    ? "① 法人リストアップ"
    : f === "send"
    ? "② 一次連絡"
    : "③ 追い連絡";
}
