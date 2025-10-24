// web/src/app/form-outreach/companies/client.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Company = {
  id: string;
  name: string;
  site_url?: string | null;
  contact_form_url?: string | null;
  created_at: string;
  last_contacted_at?: string | null;
  status?: string | null; // queued/sent/failed etc
};

type Resp = {
  ok: boolean;
  items: Company[];
  paging: {
    page: number;
    limit: number;
    total: number;
    hasPrev: boolean;
    hasNext: boolean;
  };
};

export default function Client() {
  const [data, setData] = useState<Resp | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    (async () => {
      const res = await fetch(
        `/api/form-outreach/prospects?limit=40&page=${page}`,
        { cache: "no-store" }
      );
      setData(await res.json());
    })();
  }, [page]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-bold">取得した法人リスト</h1>
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
              <th className="px-3 py-2 text-left">法人名</th>
              <th className="px-3 py-2 text-left">サイト</th>
              <th className="px-3 py-2 text-left">フォーム</th>
              <th className="px-3 py-2 text-left">最終連絡</th>
              <th className="px-3 py-2 text-left">状況</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2">
                  {c.site_url ? (
                    <a
                      href={c.site_url}
                      target="_blank"
                      className="text-indigo-700 underline-offset-2 hover:underline"
                    >
                      {c.site_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {c.contact_form_url ? (
                    <a
                      href={c.contact_form_url}
                      target="_blank"
                      className="text-indigo-700 underline-offset-2 hover:underline"
                    >
                      {c.contact_form_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {c.last_contacted_at
                    ? new Date(c.last_contacted_at).toLocaleString()
                    : "—"}
                </td>
                <td className="px-3 py-2">{c.status ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ページング */}
      <div className="mt-3 flex items-center justify-between">
        <button
          disabled={!data?.paging.hasPrev}
          onClick={() => setPage((p) => Math.max(p - 1, 0))}
          className={`rounded-lg border px-3 py-1 text-sm ${
            data?.paging.hasPrev
              ? "border-neutral-300 hover:bg-neutral-50"
              : "cursor-not-allowed border-neutral-200 text-neutral-400"
          }`}
        >
          前へ
        </button>
        <div className="text-sm text-neutral-600">
          ページ：{(data?.paging.page ?? 0) + 1} /{" "}
          {Math.max(
            Math.ceil((data?.paging.total ?? 0) / (data?.paging.limit ?? 40)),
            1
          )}
        </div>
        <button
          disabled={!data?.paging.hasNext}
          onClick={() => setPage((p) => p + 1)}
          className={`rounded-lg border px-3 py-1 text-sm ${
            data?.paging.hasNext
              ? "border-neutral-300 hover:bg-neutral-50"
              : "cursor-not-allowed border-neutral-200 text-neutral-400"
          }`}
        >
          次へ
        </button>
      </div>
    </main>
  );
}
