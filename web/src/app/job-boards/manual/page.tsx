// web/src/app/job-boards/manual/page.tsx
"use client";

import React, { useState } from "react";
import AppHeader from "@/components/AppHeader";

const SITES = [
  { key: "doda", label: "doda" },
  { key: "mynavi", label: "マイナビ" },
  { key: "type", label: "type" },
  { key: "womantype", label: "女の転職type" },
] as const;

type ResultRow = {
  site_key: string;
  jobs_count: number | null;
  candidates_count: number | null;
  fetched_at: string;
  note?: string;
};

export default function JobBoardsManualPage() {
  const [sites, setSites] = useState<string[]>(SITES.map((s) => s.key));
  const [doJobs, setDoJobs] = useState(true);
  const [doCandidates, setDoCandidates] = useState(false);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(false);

  const toggle = (k: string) =>
    setSites((arr) =>
      arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]
    );

  const run = async () => {
    setMsg("");
    setRows([]);
    setLoading(true);
    try {
      const r = await fetch("/api/job-boards/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sites, doJobs, doCandidates }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
          転職サイト 手動実行
        </h1>
        <p className="text-sm text-neutral-500 mb-3">
          公開ページから求人件数、ログイン情報があれば候補者数を取得します。
        </p>

        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="mb-3">
            <div className="text-xs text-neutral-600 mb-1">対象サイト</div>
            <div className="flex flex-wrap gap-2">
              {SITES.map((s) => {
                const on = sites.includes(s.key);
                return (
                  <label
                    key={s.key}
                    className={`text-xs inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${
                      on
                        ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                        : "border-neutral-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(s.key)}
                    />
                    {s.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mb-3 flex gap-4">
            <label className="text-sm inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={doJobs}
                onChange={(e) => setDoJobs(e.target.checked)}
              />
              求人件数
            </label>
            <label className="text-sm inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={doCandidates}
                onChange={(e) => setDoCandidates(e.target.checked)}
              />
              候補者数（ログイン必要）
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={run}
              disabled={
                loading || sites.length === 0 || (!doJobs && !doCandidates)
              }
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {loading ? "実行中…" : "選択を実行"}
            </button>
            <a
              href="/job-boards/logins"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              ログイン情報の登録へ
            </a>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 text-sm font-medium text-neutral-800">
            結果
          </div>
          <table className="min-w-[700px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">求人件数</th>
                <th className="px-3 py-3 text-left">候補者数</th>
                <th className="px-3 py-3 text-left">取得時刻</th>
                <th className="px-3 py-3 text-left">備考</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{r.site_key}</td>
                  <td className="px-3 py-2">{r.jobs_count ?? "-"}</td>
                  <td className="px-3 py-2">{r.candidates_count ?? "-"}</td>
                  <td className="px-3 py-2">
                    {r.fetched_at.replace("T", " ").replace("Z", "")}
                  </td>
                  <td className="px-3 py-2">{r.note || "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    まだ結果がありません
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
