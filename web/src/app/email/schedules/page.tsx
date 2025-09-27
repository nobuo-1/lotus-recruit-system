"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

type Row = {
  id: string;
  campaign_title: string | null;
  scheduled_at: string | null; // ISO
  status: string | null; // scheduled/queued/sent/cancelled など
};

function safe(v: any) {
  return v ?? "";
}

export default function SchedulesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/schedules", { cache: "no-store" });
        if (!res.ok) {
          setMsg(`${res.status}: ${await res.text()}`);
          setRows([]);
          return;
        }
        const j = await res.json();
        setRows(j?.rows ?? []);
      } catch (e: any) {
        setMsg(String(e?.message || e));
        setRows([]);
      }
    })();
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              メール予約リスト
            </h1>
            <p className="text-sm text-neutral-500">
              予約中のメール配信を確認します
            </p>
          </div>
          {/* 追加：メール配信トップへ */}
          <Link
            href="/email"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            メール配信トップ
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">キャンペーン</th>
                <th className="px-3 py-3 text-left">予約日時</th>
                <th className="px-3 py-3 text-left">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">{safe(r.campaign_title)}</td>
                  <td className="px-3 py-3 text-neutral-600">
                    {r.scheduled_at
                      ? new Date(r.scheduled_at).toLocaleString()
                      : ""}
                  </td>
                  <td className="px-3 py-3">{safe(r.status)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    予約はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
      </main>
    </>
  );
}
