// web/src/app/mails/schedules/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatJpDateTime } from "@/lib/formatDate";

type Row = {
  id: string;
  mail_id: string;
  scheduled_at: string | null;
  status: string | null;
  created_at: string | null;
  mails: { id: string; name: string | null; subject: string | null } | null;
};

const isFuture = (iso?: string | null) =>
  !!iso && !Number.isNaN(Date.parse(iso)) && Date.parse(iso) > Date.now();

export default function MailSchedulesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/mails/schedules/list", {
        cache: "no-store",
      });
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
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (r.status ?? "").toLowerCase() === "scheduled" &&
          isFuture(r.scheduled_at)
      ),
    [rows]
  );

  const handleCancel = async (id: string) => {
    try {
      const res = await fetch("/api/mails/schedules/cancel", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id }),
      });
      if (!res.ok) {
        setMsg(`キャンセル失敗: ${res.status} ${await res.text()}`);
      } else {
        await load();
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const isCancelable = (r: Row) =>
    (r.status ?? "").toLowerCase() === "scheduled" && isFuture(r.scheduled_at);

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            メール予約リスト
          </h1>
          <p className="text-sm text-neutral-500">作成済みの予約配信の一覧</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/email"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            メール配信トップ
          </Link>
          <Link
            href="/mails/new"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            新規作成
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-[1080px] w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left">メール名</th>
              <th className="px-3 py-3 text-left">件名</th>
              <th className="px-3 py-3 text-left">予約日時</th>
              <th className="px-3 py-3 text-left">作成日</th>
              <th className="px-3 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200">
                <td className="px-3 py-3">{r.mails?.name ?? ""}</td>
                <td className="px-3 py-3 text-neutral-600">
                  {r.mails?.subject ?? ""}
                </td>
                <td className="px-3 py-3">
                  {formatJpDateTime(r.scheduled_at)}
                </td>
                <td className="px-3 py-3">{formatJpDateTime(r.created_at)}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/mails/${r.mail_id}`}
                      className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                    >
                      詳細
                    </Link>
                    {isCancelable(r) && (
                      <button
                        onClick={() => handleCancel(r.id)}
                        className="rounded-xl border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50 whitespace-nowrap"
                        title="この予約をキャンセル"
                      >
                        予約をキャンセル
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  予約はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && (
        <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-500">
          {msg}
        </pre>
      )}
    </main>
  );
}
