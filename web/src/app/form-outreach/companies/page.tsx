// web/src/app/form-outreach/companies/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Prospect = {
  id: string;
  company_name: string;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  created_at: string;
};

export default function CompaniesPage() {
  const [rows, setRows] = useState<Prospect[]>([]);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  const load = async () => {
    const r = await fetch("/api/form-outreach/prospects?mode=all", {
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

  const filtered = rows.filter((r) =>
    [r.company_name, r.website, r.contact_email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              企業一覧
            </h1>
            <p className="text-sm text-neutral-500">
              form_prospects から表示（専用テーブルは不要）
            </p>
          </div>
          <input
            className="rounded-lg border px-3 py-2 text-sm w-72"
            placeholder="検索（社名/URL/メール）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">会社名</th>
                <th className="px-3 py-3 text-left">Web</th>
                <th className="px-3 py-3 text-left">フォーム</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">業種</th>
                <th className="px-3 py-3 text-left">規模</th>
                <th className="px-3 py-3 text-left">取得元</th>
                <th className="px-3 py-3 text-left">作成日時</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.company_name}</td>
                  <td className="px-3 py-2">
                    {r.website ? (
                      <a
                        className="text-sky-700 underline underline-offset-2"
                        href={r.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.website}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.contact_form_url ? (
                      <a
                        className="text-sky-700 underline underline-offset-2"
                        href={r.contact_form_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        開く
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">{r.contact_email ?? "-"}</td>
                  <td className="px-3 py-2">{r.industry ?? "-"}</td>
                  <td className="px-3 py-2">{r.company_size ?? "-"}</td>
                  <td className="px-3 py-2">{r.job_site_source ?? "-"}</td>
                  <td className="px-3 py-2">
                    {new Date(r.created_at).toLocaleString("ja-JP")}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-neutral-400"
                    colSpan={8}
                  >
                    対象がありません
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
