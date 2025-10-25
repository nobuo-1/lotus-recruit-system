// web/src/app/form-outreach/automation/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Rule = {
  id: string;
  name: string;
  is_active: boolean;
  schedule: string | null; // cron-like or text
  created_at?: string | null;
};

export default function FOAutomation() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/form-outreach/automation", {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "fetch error");
        setRules(j.rows ?? []);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const toggle = async (id: string, active: boolean) => {
    const r = await fetch("/api/form-outreach/automation", {
      method: "POST",
      body: JSON.stringify({ id, is_active: !active }),
      headers: { "Content-Type": "application/json" },
    });
    if (r.ok) {
      setRules((prev) =>
        prev.map((x) => (x.id === id ? { ...x, is_active: !active } : x))
      );
    }
  };

  const runNow = async () => {
    await fetch("/api/form-outreach/listup-now", { method: "POST" });
    alert("企業リストの新規取得をキューに入れました。");
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-indigo-900">
              自動実行設定
            </h1>
            <p className="text-sm text-neutral-500">
              スケジュール・有効化の管理
            </p>
          </div>
          <button
            onClick={runNow}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-neutral-50"
          >
            企業リストを今すぐ取得
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[780px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">スケジュール</th>
                <th className="px-3 py-3 text-left">状態</th>
                <th className="px-3 py-3 text-left">作成日</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">{r.name}</td>
                  <td className="px-3 py-3">{r.schedule || "-"}</td>
                  <td className="px-3 py-3">
                    {r.is_active ? "active" : "inactive"}
                  </td>
                  <td className="px-3 py-3">{r.created_at ?? ""}</td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => toggle(r.id, r.is_active)}
                      className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
                    >
                      {r.is_active ? "無効化" : "有効化"}
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    設定がありません
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
