// web/src/app/form-outreach/templates/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Row = {
  id: string;
  name: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  created_at: string;
};

export default function TemplatesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const r = await fetch("/api/form-outreach/templates", {
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

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">
            メッセージテンプレート
          </h1>
          <p className="text-sm text-neutral-500">
            prospect_id が NULL のレコードをテンプレートとして表示します
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[840px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名前</th>
                <th className="px-3 py-3 text-left">件名</th>
                <th className="px-3 py-3 text-left">作成日時</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-3">{r.name}</td>
                  <td className="px-3 py-3">{r.subject ?? "-"}</td>
                  <td className="px-3 py-3">
                    {new Date(r.created_at).toLocaleString("ja-JP")}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-neutral-400"
                    colSpan={3}
                  >
                    テンプレートがありません
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
