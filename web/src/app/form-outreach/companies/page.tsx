// web/src/app/form-outreach/companies/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Row = {
  id: string;
  company_name: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_form_url: string | null;
};
type Paged = {
  rows: Row[];
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  total: number;
  lastPage: number;
};

export default function CompaniesPage() {
  const [data, setData] = useState<Paged>({
    rows: [],
    page: 1,
    hasPrev: false,
    hasNext: false,
    total: 0,
    lastPage: 1,
  });

  const load = async (page: number) => {
    const j = await fetch(`/api/form-outreach/companies?page=${page}`, {
      cache: "no-store",
    }).then((r) => r.json());
    setData({
      rows: j?.rows || [],
      page: Number(j?.page || 1),
      hasPrev: !!j?.hasPrev,
      hasNext: !!j?.hasNext,
      total: Number(j?.total || 0),
      lastPage: Number(j?.lastPage || 1),
    });
  };

  useEffect(() => {
    load(1);
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">企業一覧</h1>
          <p className="text-sm text-neutral-500">
            エラー修正済み（安全なページャ）
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">企業名</th>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">フォームURL</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{r.company_name || "-"}</td>
                  <td className="px-3 py-2">{r.website_url || "-"}</td>
                  <td className="px-3 py-2">{r.contact_email || "-"}</td>
                  <td className="px-3 py-2">{r.contact_form_url || "-"}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => load(Math.max(1, data.page - 1))}
            disabled={!data.hasPrev}
            className={`rounded-lg px-3 py-1 text-sm border ${
              data.hasPrev
                ? "border-neutral-200 hover:bg-neutral-50"
                : "border-neutral-100 text-neutral-400"
            }`}
          >
            前へ
          </button>
          <span className="text-sm text-neutral-600">
            Page {data.page} / {data.lastPage}
          </span>
          <button
            onClick={() => load(data.page + 1)}
            disabled={!data.hasNext}
            className={`rounded-lg px-3 py-1 text-sm border ${
              data.hasNext
                ? "border-neutral-200 hover:bg-neutral-50"
                : "border-neutral-100 text-neutral-400"
            }`}
          >
            次へ
          </button>
        </div>
      </main>
    </>
  );
}
