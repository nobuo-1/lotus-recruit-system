// web/src/app/form-outreach/companies/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Row = {
  id: string;
  source_site: string | null;
  company_name: string | null;
  site_company_url: string | null;
  official_website_url: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  created_at: string | null;
  contacted: boolean;
};

export default function CompaniesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [contacted, setContacted] = useState<"" | "true" | "false">("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (contacted) params.set("contacted", contacted);
    const r = await fetch(`/api/form-outreach/companies?${params}`, {
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j?.error || "fetch failed");
    setRows(j.rows || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold mb-3">企業一覧</h1>

        <div className="rounded-2xl border border-neutral-200 p-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              placeholder="会社名/サイトURL"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm w-64"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="rounded-lg border border-neutral-200 px-2 py-2 text-sm"
              value={contacted}
              onChange={(e) => setContacted(e.target.value as any)}
            >
              <option value="">コンタクト: すべて</option>
              <option value="true">済み</option>
              <option value="false">未</option>
            </select>
            <button
              onClick={load}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              検索
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">会社名</th>
                <th className="px-3 py-3 text-left">公式サイト</th>
                <th className="px-3 py-3 text-left">フォーム/メール</th>
                <th className="px-3 py-3 text-left">取得元</th>
                <th className="px-3 py-3 text-left">コンタクト</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{r.company_name}</td>
                  <td className="px-3 py-2">{r.official_website_url || "-"}</td>
                  <td className="px-3 py-2">
                    {r.contact_form_url || r.contact_email || "-"}
                  </td>
                  <td className="px-3 py-2">{r.source_site || "-"}</td>
                  <td className="px-3 py-2">{r.contacted ? "済み" : "未"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    企業がありません
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
