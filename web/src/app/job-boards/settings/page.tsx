// web/src/app/job-boards/settings/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

type Rule = {
  id: string;
  name: string;
  email: string | null;
  sites: string[] | null;
  age_bands: string[] | null;
  employment_types: string[] | null;
  salary_bands: string[] | null;
  enabled: boolean | null;
  schedule_type: string | null;
  schedule_time: string | null; // HH:MM:SS+TZ
  schedule_days: number[] | null;
  timezone: string | null;
};

export default function NotifySettings() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/job-boards/notify-rules", {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
      setMsg("");
    } catch (e: any) {
      setRows([]);
      setMsg(String(e?.message || e));
    }
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              通知設定
            </h1>
            <p className="text-sm text-neutral-500">
              ルールの一覧／有効化・スケジュール確認
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/job-boards/destinations"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              送り先一覧
            </Link>
            <Link
              href="/job-boards/settings/new"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              新規通知ルール
            </Link>
          </div>
        </div>

        {/* ネスト無しのシンプルテーブル */}
        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">送り先</th>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">年齢/形態/年収</th>
                <th className="px-3 py-3 text-left">スケジュール</th>
                <th className="px-3 py-3 text-left">有効</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">{r.name}</td>
                  <td className="px-3 py-3">{r.email || "-"}</td>
                  <td className="px-3 py-3">
                    {(r.sites || []).join(", ") || "すべて"}
                  </td>
                  <td className="px-3 py-3">
                    {(r.age_bands || []).join("/") || "すべて"} /
                    {(r.employment_types || []).join("/") || "すべて"} /
                    {(r.salary_bands || []).join("/") || "すべて"}
                  </td>
                  <td className="px-3 py-3">
                    {r.schedule_type || "-"} {r.schedule_time || ""}{" "}
                    {(r.schedule_days || []).join(",")}
                  </td>
                  <td className="px-3 py-3">{r.enabled ? "ON" : "OFF"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    通知ルールはありません
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
