// web/src/app/job-boards/logins/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type LoginRow = {
  id: string;
  site_key: string;
  username: string;
  password: string; // ※実運用はKMS/Secrets推奨
  created_at: string;
};

const SITES = [
  { key: "doda", label: "doda" },
  { key: "mynavi", label: "マイナビ" },
  { key: "type", label: "type" },
  { key: "womantype", label: "女の転職type" },
] as const;

type SiteKey = (typeof SITES)[number]["key"]; // "doda" | "mynavi" | "type" | "womantype"

export default function JobBoardsLoginsPage() {
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [msg, setMsg] = useState("");
  const [site, setSite] = useState<SiteKey>(SITES[0].key); // ← 型を明示
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  const load = async () => {
    setMsg("");
    try {
      const r = await fetch("/api/job-boards/logins", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    try {
      const r = await fetch("/api/job-boards/logins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          site_key: site,
          username: user,
          password: pass,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "save failed");
      setUser("");
      setPass("");
      load();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const del = async (id: string) => {
    if (!confirm("削除します。よろしいですか？")) return;
    try {
      const r = await fetch("/api/job-boards/logins", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await r.json().catch(() => ({}));
      load();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
          ログイン情報の登録
        </h1>
        <p className="text-sm text-neutral-500 mb-3">
          候補者数の取得に使用します。※ 本番は KMS/Secrets を推奨。
        </p>

        <div className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs text-neutral-600 mb-1">サイト</div>
              <select
                value={site}
                onChange={(e) => setSite(e.target.value as SiteKey)} // ← キャスト
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
              >
                {SITES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">ユーザー名</div>
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">パスワード</div>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              onClick={add}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              追加/更新
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 text-sm font-medium text-neutral-800">
            登録済み
          </div>
          <table className="min-w-[700px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">ユーザー名</th>
                <th className="px-3 py-3 text-left">作成日時</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.site_key}</td>
                  <td className="px-3 py-2">{r.username}</td>
                  <td className="px-3 py-2">
                    {r.created_at?.replace("T", " ").replace("Z", "")}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => del(r.id)}
                      className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    登録がありません
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
