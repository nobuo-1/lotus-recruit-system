// web/src/app/form-outreach/automation/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type LimitRow = {
  id: string;
  daily_limit: number | null;
  enabled: boolean | null;
};

export default function OutreachAutomation() {
  const [row, setRow] = useState<LimitRow | null>(null);
  const [daily, setDaily] = useState<number>(100);
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/form-outreach/limits", {
        cache: "no-store",
      });
      const j = await res.json();
      const r: LimitRow | null = j?.row ?? null;
      setRow(r);
      setDaily((r?.daily_limit ?? 100) as number);
      setEnabled(!!r?.enabled);
    })();
  }, []);

  const save = async () => {
    const res = await fetch("/api/form-outreach/limits", {
      method: "POST",
      body: JSON.stringify({ daily_limit: daily, enabled }),
      headers: { "Content-Type": "application/json" },
    });
    const j = await res.json();
    setRow(j?.row ?? null);
    alert("保存しました");
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">
            自動実行設定
          </h1>
          <p className="text-sm text-neutral-500">一日上限とON/OFFを設定</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 p-4">
          <div className="mb-3 flex items-center gap-3">
            <label className="text-sm text-neutral-700">一日上限</label>
            <input
              type="number"
              className="w-32 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              value={daily}
              onChange={(e) => setDaily(Number(e.target.value || 0))}
              min={0}
            />
          </div>
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm text-neutral-700">有効化</label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          </div>
          <button
            onClick={save}
            className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            保存
          </button>
        </div>
      </main>
    </>
  );
}
