// web/src/app/form-outreach/messages/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Row = {
  id: string;
  name: string | null; // ← テンプレ名（channel='template' の name を転記しておく or 同名保持）
  subject: string | null;
  email: string | null;
  form_url: string | null;
  status: string | null;
  error: string | null;
  sent_at: string | null;
};

export default function MessagesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/form-outreach/messages", {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "fetch failed");
        setRows(j.rows || []);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold mb-3">送信ログ</h1>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">テンプレート名</th>
                <th className="px-3 py-3 text-left">宛先/フォーム</th>
                <th className="px-3 py-3 text-left">状態</th>
                <th className="px-3 py-3 text-left">エラー</th>
                <th className="px-3 py-3 text-left">送信日時</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{r.name || "-"}</td>
                  <td className="px-3 py-2">{r.email || r.form_url || "-"}</td>
                  <td className="px-3 py-2">{r.status || "-"}</td>
                  <td className="px-3 py-2 text-red-600">{r.error || ""}</td>
                  <td className="px-3 py-2">{r.sent_at || "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    ログはありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {msg && (
          <pre className="mt-2 text-xs text-red-600 whitespace-pre-wrap">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
