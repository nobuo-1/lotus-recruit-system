// web/src/app/form-outreach/templates/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type TemplateRow = {
  id: string;
  name: string;
  subject: string | null;
  channel: string | null;
  created_at: string | null;
};

export default function TemplatesPage() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/templates", {
        headers: { "x-tenant-id": TENANT_ID },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
      setRows([]);
    }
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
            form_outreach_messages テーブルの内容を表示します。
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">件名</th>
                <th className="px-3 py-3 text-left">チャンネル</th>
                <th className="px-3 py-3 text-left">作成日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="px-3 py-2">{t.subject || "-"}</td>
                  <td className="px-3 py-2">{t.channel || "-"}</td>
                  <td className="px-3 py-2">
                    {t.created_at?.replace("T", " ").replace("Z", "") || "-"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    テンプレートがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
