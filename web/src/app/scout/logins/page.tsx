"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

type ClientRow = {
  id: string;
  tenant_id: string;
  client_name: string;
  memo?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type LoginRow = {
  id: string;
  tenant_id: string;
  client_id: string;
  site_key: string;
  username: string;
  password: string;
  login_note?: string | null;
  created_at: string;
  updated_at: string;
};

const SITES = [
  { key: "doda", label: "doda" },
  { key: "mynavi", label: "マイナビ" },
  { key: "type", label: "type" },
  { key: "womantype", label: "女の転職type" },
] as const;

type SiteKey = (typeof SITES)[number]["key"];

const SITE_LABEL_MAP: Record<string, string> = SITES.reduce((acc, site) => {
  acc[site.key] = site.label;
  return acc;
}, {} as Record<string, string>);

type LoginDraft = {
  id: string | null;
  site_key: SiteKey;
  username: string;
  password: string;
  login_note: string;
};

const defaultLoginDraft: LoginDraft = {
  id: null,
  site_key: SITES[0].key,
  username: "",
  password: "",
  login_note: "",
};

export default function ScoutLoginsPage() {
  const [msg, setMsg] = useState("");

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientDraftName, setClientDraftName] = useState("");
  const [clientDraftMemo, setClientDraftMemo] = useState("");
  const [clientEditName, setClientEditName] = useState("");
  const [clientEditMemo, setClientEditMemo] = useState("");
  const [clientEditActive, setClientEditActive] = useState(true);

  const [logins, setLogins] = useState<LoginRow[]>([]);
  const [loginDraft, setLoginDraft] = useState<LoginDraft>(defaultLoginDraft);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const loadClients = async () => {
    setMsg("");
    try {
      const r = await fetch("/api/scout/clients", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      const rows = (j?.rows ?? []) as ClientRow[];
      setClients(rows);
      if (rows.length === 0) {
        setSelectedClientId(null);
      } else if (!selectedClientId || !rows.some((c) => c.id === selectedClientId)) {
        setSelectedClientId(rows[0].id);
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const loadLogins = async (clientId: string) => {
    setMsg("");
    try {
      const r = await fetch(`/api/scout/logins?client_id=${clientId}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setLogins(j?.rows ?? []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setLogins([]);
      return;
    }
    loadLogins(selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    setLoginDraft(defaultLoginDraft);
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClient) return;
    setClientEditName(selectedClient.client_name || "");
    setClientEditMemo(selectedClient.memo || "");
    setClientEditActive(!!selectedClient.is_active);
  }, [selectedClient]);

  const addClient = async () => {
    setMsg("");
    const name = clientDraftName.trim();
    if (!name) {
      setMsg("クライアント名を入力してください。");
      return;
    }
    try {
      const r = await fetch("/api/scout/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: name,
          memo: clientDraftMemo,
          is_active: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "save failed");
      setClientDraftName("");
      setClientDraftMemo("");
      await loadClients();
      if (j?.row?.id) setSelectedClientId(j.row.id);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const updateClient = async () => {
    if (!selectedClientId) return;
    setMsg("");
    const name = clientEditName.trim();
    if (!name) {
      setMsg("クライアント名を入力してください。");
      return;
    }
    try {
      const r = await fetch("/api/scout/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selectedClientId,
          client_name: name,
          memo: clientEditMemo,
          is_active: clientEditActive,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "update failed");
      await loadClients();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const deleteClient = async () => {
    if (!selectedClientId) return;
    if (!confirm("このクライアントを削除します。よろしいですか？")) return;
    setMsg("");
    try {
      const r = await fetch("/api/scout/clients", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selectedClientId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "delete failed");
      setSelectedClientId(null);
      setLogins([]);
      await loadClients();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const saveLogin = async () => {
    if (!selectedClientId) {
      setMsg("クライアントを選択してください。");
      return;
    }
    const siteKey = loginDraft.site_key;
    const username = loginDraft.username.trim();
    const password = loginDraft.password.trim();
    if (!siteKey || !username || !password) {
      setMsg("サイト/ユーザー名/パスワードを入力してください。");
      return;
    }
    setMsg("");
    try {
      const r = await fetch("/api/scout/logins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: loginDraft.id,
          client_id: selectedClientId,
          site_key: siteKey,
          username,
          password,
          login_note: loginDraft.login_note,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "save failed");
      setLoginDraft(defaultLoginDraft);
      await loadLogins(selectedClientId);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const editLogin = (row: LoginRow) => {
    setLoginDraft({
      id: row.id,
      site_key: row.site_key as SiteKey,
      username: row.username,
      password: row.password,
      login_note: row.login_note ?? "",
    });
  };

  const deleteLogin = async (id: string) => {
    if (!confirm("このログイン情報を削除します。よろしいですか？")) return;
    setMsg("");
    try {
      const r = await fetch("/api/scout/logins", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "delete failed");
      if (selectedClientId) await loadLogins(selectedClientId);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const resetLoginDraft = () => setLoginDraft(defaultLoginDraft);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold text-neutral-900">
                スカウト自動送信用ログイン情報
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                クライアント企業と転職サイトのログイン情報を管理します。
              </p>
            </div>
            <Link
              href="/scout"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
            >
              スカウト自動送信に戻る
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <section className="rounded-2xl border border-neutral-200 p-4 md:col-span-2">
            <div className="text-sm font-semibold text-neutral-800">
              クライアント企業
            </div>
            <div className="mt-3 space-y-2">
              <div>
                <div className="text-xs text-neutral-600 mb-1">
                  クライアント名
                </div>
                <input
                  value={clientDraftName}
                  onChange={(e) => setClientDraftName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="例）ABC株式会社"
                />
              </div>
              <div>
                <div className="text-xs text-neutral-600 mb-1">メモ</div>
                <input
                  value={clientDraftMemo}
                  onChange={(e) => setClientDraftMemo(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="担当や補足情報"
                />
              </div>
              <button
                onClick={addClient}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                クライアントを追加
              </button>
            </div>

            <div className="mt-4 border-t border-neutral-200 pt-3">
              <div className="text-xs font-medium text-neutral-600 mb-2">
                登録済みクライアント
              </div>
              <div className="space-y-2">
                {clients.map((c) => {
                  const selected = c.id === selectedClientId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedClientId(c.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        selected
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-neutral-200 hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-neutral-900">
                          {c.client_name}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            c.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-neutral-100 text-neutral-500"
                          }`}
                        >
                          {c.is_active ? "稼働中" : "停止中"}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-500">
                        {c.memo || "メモなし"}
                      </div>
                    </button>
                  );
                })}
                {clients.length === 0 && (
                  <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-6 text-center text-xs text-neutral-400">
                    クライアントが未登録です
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 p-4 md:col-span-3">
            <div className="text-sm font-semibold text-neutral-800">
              ログイン情報
            </div>
            {!selectedClient ? (
              <div className="mt-4 rounded-lg border border-dashed border-neutral-200 px-3 py-8 text-center text-xs text-neutral-400">
                左側からクライアント企業を選択してください
              </div>
            ) : (
              <>
                <div className="mt-3 rounded-xl border border-neutral-200 p-3">
                  <div className="text-xs font-semibold text-neutral-700 mb-2">
                    クライアント情報
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-neutral-600 mb-1">
                        クライアント名
                      </div>
                      <input
                        value={clientEditName}
                        onChange={(e) => setClientEditName(e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-neutral-600 mb-1">
                        稼働ステータス
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={clientEditActive}
                          onChange={(e) =>
                            setClientEditActive(e.target.checked)
                          }
                        />
                        {clientEditActive ? "稼働中" : "停止中"}
                      </label>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-neutral-600 mb-1">メモ</div>
                      <input
                        value={clientEditMemo}
                        onChange={(e) => setClientEditMemo(e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={updateClient}
                      className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
                    >
                      クライアントを更新
                    </button>
                    <button
                      onClick={deleteClient}
                      className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                    >
                      クライアントを削除
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-neutral-200 p-3">
                  <div className="text-xs font-semibold text-neutral-700 mb-2">
                    ログイン情報の追加/更新
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-neutral-600 mb-1">サイト</div>
                      <select
                        value={loginDraft.site_key}
                        onChange={(e) =>
                          setLoginDraft((prev) => ({
                            ...prev,
                            site_key: e.target.value as SiteKey,
                          }))
                        }
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
                      <div className="text-xs text-neutral-600 mb-1">
                        ユーザー名
                      </div>
                      <input
                        value={loginDraft.username}
                        onChange={(e) =>
                          setLoginDraft((prev) => ({
                            ...prev,
                            username: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-neutral-600 mb-1">
                        パスワード
                      </div>
                      <input
                        type="password"
                        value={loginDraft.password}
                        onChange={(e) =>
                          setLoginDraft((prev) => ({
                            ...prev,
                            password: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-neutral-600 mb-1">メモ</div>
                      <input
                        value={loginDraft.login_note}
                        onChange={(e) =>
                          setLoginDraft((prev) => ({
                            ...prev,
                            login_note: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={saveLogin}
                      className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
                    >
                      {loginDraft.id ? "ログイン情報を更新" : "ログイン情報を保存"}
                    </button>
                    <button
                      onClick={resetLoginDraft}
                      className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
                    >
                      クリア
                    </button>
                    <span className="text-[11px] text-neutral-500">
                      本番運用は KMS/Secrets の利用を推奨します。
                    </span>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200">
                  <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-700">
                    登録済みログイン情報
                  </div>
                  <table className="min-w-[680px] w-full text-sm">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="px-3 py-2 text-left">サイト</th>
                        <th className="px-3 py-2 text-left">ユーザー名</th>
                        <th className="px-3 py-2 text-left">更新日時</th>
                        <th className="px-3 py-2 text-left">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {logins.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2">
                            {SITE_LABEL_MAP[r.site_key] || r.site_key}
                          </td>
                          <td className="px-3 py-2">{r.username}</td>
                          <td className="px-3 py-2">
                            {r.updated_at?.replace("T", " ").replace("Z", "")}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => editLogin(r)}
                                className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => deleteLogin(r.id)}
                                className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                              >
                                削除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {logins.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-10 text-center text-neutral-400"
                          >
                            ログイン情報がありません
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
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
