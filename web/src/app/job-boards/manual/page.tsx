// web/src/app/job-boards/manual/page.tsx
"use client";

import React, { useState } from "react";
import AppHeader from "@/components/AppHeader";

export default function JobBoardsManualPage() {
  const [msg, setMsg] = useState("");

  const run = async () => {
    try {
      const res = await fetch("/api/job-boards/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }), // すべて取得
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "failed");
      alert(
        "すべてのデータ取得ジョブをキュー登録しました。実行状況でご確認ください。"
      );
      setMsg("");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
          手動実行
        </h1>
        <p className="text-sm text-neutral-500 mb-4">
          全サイト・全条件で最新データ収集を実行します。
        </p>

        <section className="rounded-2xl border border-neutral-200 p-6">
          <button
            onClick={run}
            className="rounded-lg px-4 py-2 border border-neutral-300 hover:bg-neutral-50"
          >
            今すぐ実行
          </button>
          {msg && (
            <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
              {msg}
            </pre>
          )}
        </section>
      </main>
    </>
  );
}
