// web/src/app/job-boards/settings/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

export default function JobBoardsSettings() {
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [sites, setSites] = useState<{ key: string; enabled: boolean }[]>([]);

  useEffect(() => {
    (async () => {
      const [e1, e2] = await Promise.all([
        fetch("/api/job-boards/notify-emails").then((r) => r.json()),
        fetch("/api/job-boards/site-selection").then((r) => r.json()),
      ]);
      setEmails(e1?.emails ?? []);
      setSites(e2?.sites ?? []);
    })();
  }, []);

  const addEmail = async () => {
    if (!newEmail.trim()) return;
    const res = await fetch("/api/job-boards/notify-emails", {
      method: "POST",
      body: JSON.stringify({ email: newEmail }),
      headers: { "Content-Type": "application/json" },
    });
    const j = await res.json();
    setEmails(j?.emails ?? []);
    setNewEmail("");
  };

  const toggleSite = async (key: string) => {
    const res = await fetch("/api/job-boards/site-selection", {
      method: "POST",
      body: JSON.stringify({ key }),
      headers: { "Content-Type": "application/json" },
    });
    const j = await res.json();
    setSites(j?.sites ?? []);
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">
            転職サイト設定
          </h1>
          <p className="text-sm text-neutral-500">通知先と対象サイトの切替</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-neutral-200 p-4">
            <h2 className="mb-2 text-lg font-semibold">通知メール</h2>
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <button
                onClick={addEmail}
                className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                追加
              </button>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {emails.map((m) => (
                <li key={m} className="text-neutral-700">
                  {m}
                </li>
              ))}
              {emails.length === 0 && (
                <li className="text-neutral-400">未登録です</li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-neutral-200 p-4">
            <h2 className="mb-2 text-lg font-semibold">対象サイト</h2>
            <ul className="space-y-2">
              {sites.map((s) => (
                <li
                  key={s.key}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2"
                >
                  <span className="text-sm">{s.key}</span>
                  <button
                    onClick={() => toggleSite(s.key)}
                    className={`rounded-lg px-2 py-1 text-xs ${
                      s.enabled
                        ? "border border-emerald-400 text-emerald-700"
                        : "border border-neutral-200 text-neutral-600"
                    }`}
                  >
                    {s.enabled ? "ON" : "OFF"}
                  </button>
                </li>
              ))}
              {sites.length === 0 && (
                <li className="text-neutral-400 text-sm">サイトがありません</li>
              )}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
