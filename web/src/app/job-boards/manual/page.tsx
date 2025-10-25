// web/src/app/job-boards/manual/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { RotateCw } from "lucide-react";

type ErrorRow = {
  id: string;
  run_id?: string | null;
  site_code?: string | null;
  captured_at?: string | null;
  message: string;
};

const SITES = [
  { code: "mynavi", label: "マイナビ" },
  { code: "doda", label: "doda" },
  { code: "type", label: "type" },
  { code: "womantype", label: "女の転職Type" },
] as const;

export default function JobBoardsManual() {
  const [selected, setSelected] = useState<string[]>(SITES.map((s) => s.code));
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [msg, setMsg] = useState("");

  const toggle = (code: string) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const submit = async () => {
    if (selected.length === 0) {
      alert("少なくとも1つのサイトを選択してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/job-boards/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites: selected }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "実行に失敗しました");
      alert("収集ジョブを開始しました。実行状況ページでご確認ください。");
      setMsg("");
      fetchErrors();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const fetchErrors = async () => {
    try {
      const res = await fetch("/api/job-boards/errors?limit=40", {
        cache: "no-store",
      });
      const j = await res.json();
      setErrors(j?.rows ?? []);
    } catch (e: any) {
      setErrors([]);
    }
  };

  useEffect(() => {
    fetchErrors();
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">手動実行</h1>
          <p className="text-sm text-neutral-500">
            対象サイトを選択して即時に収集を実行します。
          </p>
        </div>

        {/* 対象サイトトグル */}
        <div className="mb-4 flex flex-wrap gap-2">
          {SITES.map((s) => {
            const active = selected.includes(s.code);
            return (
              <button
                key={s.code}
                onClick={() => toggle(s.code)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  active
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-300"
                    : "border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={submit}
          disabled={submitting || selected.length === 0}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm ${
            submitting || selected.length === 0
              ? "border border-neutral-200 text-neutral-400"
              : "border border-neutral-200 hover:bg-neutral-50"
          }`}
        >
          <RotateCw className={`h-4 w-4 ${submitting ? "animate-spin" : ""}`} />
          今すぐ実行
        </button>

        {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

        {/* 収集エラー一覧 */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold">直近のエラー</h2>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-neutral-200">
            <table className="min-w-[880px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">時刻</th>
                  <th className="px-3 py-3 text-left">サイト</th>
                  <th className="px-3 py-3 text-left">メッセージ</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.id} className="border-t border-neutral-200">
                    <td className="px-3 py-2">{e.captured_at ?? "-"}</td>
                    <td className="px-3 py-2">{e.site_code ?? "-"}</td>
                    <td className="px-3 py-2">{e.message}</td>
                  </tr>
                ))}
                {errors.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      直近のエラーはありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
