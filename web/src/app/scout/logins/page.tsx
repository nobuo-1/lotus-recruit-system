"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import {
  DataTableCard,
  PageHero,
  PageMain,
  SectionTitle,
  StatChip,
  SurfaceCard,
} from "@/components/PageChrome";

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
  login_url?: string | null;
  account_label?: string | null;
  two_factor_method?: string | null;
  two_factor_contact?: string | null;
  two_factor_note?: string | null;
  contract_id?: string | null;
  plan_id?: string | null;
  job_posting_ids?: string | null;
  job_posting_names?: string | null;
  scout_template_ids?: string | null;
  target_search_url?: string | null;
  target_conditions?: string | null;
  exclusion_rules?: string | null;
  daily_send_limit?: number | null;
  operation_window?: string | null;
  sender_name?: string | null;
  sender_email?: string | null;
  reply_to?: string | null;
  status?: string | null;
  last_verified_at?: string | null;
  login_note?: string | null;
  created_at: string;
  updated_at: string;
};

const SITES = [
  {
    key: "mynavi",
    label: "マイナビ",
    loginUrl: "https://tenshoku.mynavi.jp/client/menu/index.cfm",
  },
  {
    key: "doda",
    label: "doda",
    loginUrl: "https://assist.doda.jp/DodaAssistR/System/Login",
  },
  { key: "type", label: "type", loginUrl: "https://hr.type.jp/" },
  {
    key: "womantype",
    label: "女の転職type",
    loginUrl: "https://hr.woman-type.jp/",
  },
] as const;

type SiteKey = (typeof SITES)[number]["key"];
type LoginStatus = "ready" | "needs_check" | "paused";
type TwoFactorMethod = "none" | "email" | "sms" | "app" | "manual";

type LoginMeta = {
  login_url: string;
  account_label: string;
  two_factor_method: TwoFactorMethod;
  two_factor_contact: string;
  two_factor_note: string;
  contract_id: string;
  plan_id: string;
  job_posting_ids: string;
  job_posting_names: string;
  scout_template_ids: string;
  target_search_url: string;
  target_conditions: string;
  exclusion_rules: string;
  daily_send_limit: string;
  operation_window: string;
  sender_name: string;
  sender_email: string;
  reply_to: string;
  status: LoginStatus;
  last_verified_at: string;
  note: string;
};

type LoginDraft = {
  id: string | null;
  site_key: SiteKey;
  username: string;
  password: string;
  meta: LoginMeta;
};

type ClientsResponse = {
  rows?: ClientRow[];
  row?: ClientRow;
  error?: string;
};

type LoginsResponse = {
  rows?: LoginRow[];
  row?: LoginRow;
  error?: string;
};

const SITE_LABEL_MAP: Record<string, string> = SITES.reduce((acc, site) => {
  acc[site.key] = site.label;
  return acc;
}, {} as Record<string, string>);

const SITE_URL_MAP: Record<SiteKey, string> = SITES.reduce((acc, site) => {
  acc[site.key] = site.loginUrl;
  return acc;
}, {} as Record<SiteKey, string>);

const REQUIRED_GROUPS = [
  {
    title: "認証",
    items: "ログインURL、ID、パスワード、2段階認証の受け取り方法、緊急時の対応メモ",
  },
  {
    title: "契約・求人",
    items: "契約ID、プランID、求人票ID、掲載求人名、スカウト利用権限",
  },
  {
    title: "候補者検索",
    items: "検索URL、職種・勤務地・経験条件、除外条件、重複送信ルール",
  },
  {
    title: "送信設定",
    items: "使用テンプレート、送信者名、返信先、1日上限、実行時間帯",
  },
  {
    title: "運用確認",
    items: "最終ログイン確認日、稼働可否、媒体ごとの注意事項、担当者メモ",
  },
];

function defaultMeta(siteKey: SiteKey): LoginMeta {
  return {
    login_url: SITE_URL_MAP[siteKey],
    account_label: "",
    two_factor_method: "manual",
    two_factor_contact: "",
    two_factor_note: "",
    contract_id: "",
    plan_id: "",
    job_posting_ids: "",
    job_posting_names: "",
    scout_template_ids: "",
    target_search_url: "",
    target_conditions: "",
    exclusion_rules: "過去送信済み、応募済み、辞退済み、対象外職種は除外",
    daily_send_limit: "",
    operation_window: "平日 10:00-18:00",
    sender_name: "",
    sender_email: "",
    reply_to: "",
    status: "needs_check",
    last_verified_at: "",
    note: "",
  };
}

function defaultLoginDraft(siteKey: SiteKey = SITES[0].key): LoginDraft {
  return {
    id: null,
    site_key: siteKey,
    username: "",
    password: "",
    meta: defaultMeta(siteKey),
  };
}

function parseLegacyMeta(
  raw?: string | null,
  siteKey: SiteKey = SITES[0].key
): Partial<LoginMeta> {
  const base = defaultMeta(siteKey);
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.__type === "scout_login_meta") {
      return parsed;
    }
  } catch {
    return { note: raw };
  }
  return { note: raw };
}

function rowToMeta(row: LoginRow, siteKey: SiteKey): LoginMeta {
  const legacy = parseLegacyMeta(row.login_note, siteKey);
  const base = { ...defaultMeta(siteKey), ...legacy };
  return {
    ...base,
    login_url: row.login_url ?? base.login_url,
    account_label: row.account_label ?? base.account_label,
    two_factor_method: normalizeTwoFactorMethod(
      row.two_factor_method ?? base.two_factor_method
    ),
    two_factor_contact: row.two_factor_contact ?? base.two_factor_contact,
    two_factor_note: row.two_factor_note ?? base.two_factor_note,
    contract_id: row.contract_id ?? base.contract_id,
    plan_id: row.plan_id ?? base.plan_id,
    job_posting_ids: row.job_posting_ids ?? base.job_posting_ids,
    job_posting_names: row.job_posting_names ?? base.job_posting_names,
    scout_template_ids: row.scout_template_ids ?? base.scout_template_ids,
    target_search_url: row.target_search_url ?? base.target_search_url,
    target_conditions: row.target_conditions ?? base.target_conditions,
    exclusion_rules: row.exclusion_rules ?? base.exclusion_rules,
    daily_send_limit:
      row.daily_send_limit === null || row.daily_send_limit === undefined
        ? base.daily_send_limit
        : String(row.daily_send_limit),
    operation_window: row.operation_window ?? base.operation_window,
    sender_name: row.sender_name ?? base.sender_name,
    sender_email: row.sender_email ?? base.sender_email,
    reply_to: row.reply_to ?? base.reply_to,
    status: normalizeStatus(row.status ?? base.status),
    last_verified_at: row.last_verified_at ?? base.last_verified_at,
    note: row.login_note && !row.login_note.trim().startsWith("{")
      ? row.login_note
      : base.note,
  };
}

function statusLabel(status: LoginStatus | string | undefined) {
  if (status === "ready") return "送信可能";
  if (status === "paused") return "停止中";
  return "要確認";
}

function normalizeTwoFactorMethod(value?: string | null): TwoFactorMethod {
  if (value === "none" || value === "email" || value === "sms" || value === "app") {
    return value;
  }
  return "manual";
}

function normalizeStatus(value?: string | null): LoginStatus {
  if (value === "ready" || value === "paused") return value;
  return "needs_check";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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
  const [loginDraft, setLoginDraft] = useState<LoginDraft>(defaultLoginDraft());

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const savedMetas = useMemo(
    () =>
      logins.map((row) => ({
        row,
        meta: rowToMeta(row, row.site_key as SiteKey),
      })),
    [logins]
  );

  const readyCount = savedMetas.filter((item) => item.meta.status === "ready").length;

  const patchMeta = (patch: Partial<LoginMeta>) => {
    setLoginDraft((prev) => ({ ...prev, meta: { ...prev.meta, ...patch } }));
  };

  const loadClients = useCallback(async (preferredClientId?: string | null) => {
    setMsg("");
    try {
      const r = await fetch("/api/scout/clients", { cache: "no-store" });
      const j = (await r.json()) as ClientsResponse;
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      const rows = j?.rows ?? [];
      setClients(rows);
      if (rows.length === 0) {
        setSelectedClientId(null);
      } else if (
        !preferredClientId ||
        !rows.some((c) => c.id === preferredClientId)
      ) {
        setSelectedClientId(rows[0].id);
      }
    } catch (e: unknown) {
      setMsg(errorMessage(e));
    }
  }, []);

  const loadLogins = useCallback(async (clientId: string) => {
    setMsg("");
    try {
      const r = await fetch(`/api/scout/logins?client_id=${clientId}`, {
        cache: "no-store",
      });
      const j = (await r.json()) as LoginsResponse;
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setLogins(j?.rows ?? []);
    } catch (e: unknown) {
      setMsg(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    loadClients(null);
  }, [loadClients]);

  useEffect(() => {
    if (!selectedClientId) {
      setLogins([]);
      return;
    }
    loadLogins(selectedClientId);
  }, [loadLogins, selectedClientId]);

  useEffect(() => {
    setLoginDraft(defaultLoginDraft());
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
    if (!name) return setMsg("クライアント名を入力してください。");
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
      const j = (await r.json()) as ClientsResponse;
      if (!r.ok) throw new Error(j?.error || "save failed");
      setClientDraftName("");
      setClientDraftMemo("");
      await loadClients(j?.row?.id ?? null);
      if (j?.row?.id) setSelectedClientId(j.row.id);
    } catch (e: unknown) {
      setMsg(errorMessage(e));
    }
  };

  const updateClient = async () => {
    if (!selectedClientId) return;
    setMsg("");
    const name = clientEditName.trim();
    if (!name) return setMsg("クライアント名を入力してください。");
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
      const j = (await r.json()) as ClientsResponse;
      if (!r.ok) throw new Error(j?.error || "update failed");
      await loadClients(selectedClientId);
    } catch (e: unknown) {
      setMsg(errorMessage(e));
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
      const j = (await r.json().catch(() => ({}))) as ClientsResponse;
      if (!r.ok) throw new Error(j?.error || "delete failed");
      setSelectedClientId(null);
      setLogins([]);
      await loadClients(null);
    } catch (e: unknown) {
      setMsg(errorMessage(e));
    }
  };

  const saveLogin = async () => {
    if (!selectedClientId) return setMsg("クライアントを選択してください。");
    const siteKey = loginDraft.site_key;
    const username = loginDraft.username.trim();
    const password = loginDraft.password.trim();
    if (!siteKey || !username || !password) {
      return setMsg("サイト/ログインID/パスワードを入力してください。");
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
          login_url: loginDraft.meta.login_url,
          account_label: loginDraft.meta.account_label,
          two_factor_method: loginDraft.meta.two_factor_method,
          two_factor_contact: loginDraft.meta.two_factor_contact,
          two_factor_note: loginDraft.meta.two_factor_note,
          contract_id: loginDraft.meta.contract_id,
          plan_id: loginDraft.meta.plan_id,
          job_posting_ids: loginDraft.meta.job_posting_ids,
          job_posting_names: loginDraft.meta.job_posting_names,
          scout_template_ids: loginDraft.meta.scout_template_ids,
          target_search_url: loginDraft.meta.target_search_url,
          target_conditions: loginDraft.meta.target_conditions,
          exclusion_rules: loginDraft.meta.exclusion_rules,
          daily_send_limit: loginDraft.meta.daily_send_limit,
          operation_window: loginDraft.meta.operation_window,
          sender_name: loginDraft.meta.sender_name,
          sender_email: loginDraft.meta.sender_email,
          reply_to: loginDraft.meta.reply_to,
          status: loginDraft.meta.status,
          last_verified_at: loginDraft.meta.last_verified_at,
          login_note: loginDraft.meta.note,
        }),
      });
      const j = (await r.json()) as LoginsResponse;
      if (!r.ok) throw new Error(j?.error || "save failed");
      setLoginDraft(defaultLoginDraft(siteKey));
      setMsg("ログイン情報を保存しました。");
      await loadLogins(selectedClientId);
    } catch (e: unknown) {
      setMsg(errorMessage(e));
    }
  };

  const editLogin = (row: LoginRow) => {
    const siteKey = (SITES.some((site) => site.key === row.site_key)
      ? row.site_key
      : SITES[0].key) as SiteKey;
    setLoginDraft({
      id: row.id,
      site_key: siteKey,
      username: row.username,
      password: row.password,
      meta: rowToMeta(row, siteKey),
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
      const j = (await r.json().catch(() => ({}))) as LoginsResponse;
      if (!r.ok) throw new Error(j?.error || "delete failed");
      if (selectedClientId) await loadLogins(selectedClientId);
    } catch (e: unknown) {
      setMsg(errorMessage(e));
    }
  };

  const resetLoginDraft = () => setLoginDraft(defaultLoginDraft(loginDraft.site_key));

  return (
    <>
      <AppHeader showBack />
      <PageMain className="space-y-6">
        <PageHero
          eyebrow="Scout Credentials"
          title="スカウト自動送信用ログイン情報"
          description="媒体ログインだけでなく、求人票、候補者検索条件、送信上限、2段階認証の扱いまで、実行に必要な情報をクライアント単位で管理します。"
          accent="rose"
          actions={[
            { href: "/scout", label: "スカウト運用トップ", variant: "secondary" },
          ]}
        />

        <SurfaceCard>
          <SectionTitle
            title="スカウト送信に必要な情報"
            description="各社の求人を出す会社として媒体上からスカウトメールを送る前に、最低限そろえる情報です。"
          />
          <div className="grid gap-3 md:grid-cols-5">
            {REQUIRED_GROUPS.map((group) => (
              <div
                key={group.title}
                className="rounded-2xl border border-neutral-200 bg-white p-3"
              >
                <div className="text-sm font-semibold text-neutral-900">
                  {group.title}
                </div>
                <p className="mt-2 text-xs leading-5 text-neutral-600">
                  {group.items}
                </p>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <SurfaceCard className="md:col-span-2">
            <SectionTitle title="クライアント企業" />
            <div className="mt-3 space-y-2">
              <Field label="クライアント名">
                <input
                  value={clientDraftName}
                  onChange={(e) => setClientDraftName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="例）ABC株式会社"
                />
              </Field>
              <Field label="運用メモ">
                <input
                  value={clientDraftMemo}
                  onChange={(e) => setClientDraftMemo(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="媒体担当、契約状況、注意事項"
                />
              </Field>
              <button
                onClick={addClient}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                クライアントを追加
              </button>
            </div>

            <div className="mt-4 border-t border-neutral-200 pt-3">
              <div className="mb-2 text-xs font-medium text-neutral-600">
                登録済みクライアント
              </div>
              <div className="space-y-2">
                {clients.map((client) => {
                  const selected = client.id === selectedClientId;
                  return (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        selected
                          ? "border-neutral-900 bg-neutral-950 text-white"
                          : "border-neutral-200 hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">
                          {client.client_name}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            selected
                              ? "bg-white/15 text-white"
                              : client.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-neutral-100 text-neutral-500"
                          }`}
                        >
                          {client.is_active ? "稼働中" : "停止中"}
                        </span>
                      </div>
                      <div
                        className={`mt-1 text-[11px] ${
                          selected ? "text-white/70" : "text-neutral-500"
                        }`}
                      >
                        {client.memo || "メモなし"}
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
          </SurfaceCard>

          <div className="space-y-4 md:col-span-3">
            {!selectedClient ? (
              <SurfaceCard>
                <div className="py-10 text-center text-sm text-neutral-400">
                  左側からクライアント企業を選択してください
                </div>
              </SurfaceCard>
            ) : (
              <>
                <SurfaceCard>
                  <SectionTitle title="クライアント運用設定" />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label="クライアント名">
                      <input
                        value={clientEditName}
                        onChange={(e) => setClientEditName(e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="稼働ステータス">
                      <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={clientEditActive}
                          onChange={(e) => setClientEditActive(e.target.checked)}
                        />
                        {clientEditActive ? "稼働中" : "停止中"}
                      </label>
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="運用メモ">
                        <input
                          value={clientEditMemo}
                          onChange={(e) => setClientEditMemo(e.target.value)}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        />
                      </Field>
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
                </SurfaceCard>

                <SurfaceCard>
                  <SectionTitle
                    title="媒体アカウント・送信条件"
                    description="ログイン、求人票、検索条件、送信上限を同じ単位で保存します。"
                  />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label="媒体">
                      <select
                        value={loginDraft.site_key}
                        onChange={(e) => {
                          const nextSite = e.target.value as SiteKey;
                          setLoginDraft((prev) => ({
                            ...prev,
                            site_key: nextSite,
                            meta: {
                              ...prev.meta,
                              login_url: SITE_URL_MAP[nextSite],
                            },
                          }));
                        }}
                        className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                      >
                        {SITES.map((site) => (
                          <option key={site.key} value={site.key}>
                            {site.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="ログインURL">
                      <input
                        value={loginDraft.meta.login_url}
                        onChange={(e) => patchMeta({ login_url: e.target.value })}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="アカウント名 / 管理画面表示名">
                      <input
                        value={loginDraft.meta.account_label}
                        onChange={(e) =>
                          patchMeta({ account_label: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="ログインID / メールアドレス">
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
                    </Field>
                    <Field label="パスワード">
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
                    </Field>
                    <Field label="2段階認証">
                      <select
                        value={loginDraft.meta.two_factor_method}
                        onChange={(e) =>
                          patchMeta({
                            two_factor_method: e.target.value as TwoFactorMethod,
                          })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                      >
                        <option value="manual">手動確認</option>
                        <option value="email">メール</option>
                        <option value="sms">SMS</option>
                        <option value="app">認証アプリ</option>
                        <option value="none">なし</option>
                      </select>
                    </Field>
                    <Field label="2段階認証の連絡先 / 担当">
                      <input
                        value={loginDraft.meta.two_factor_contact}
                        onChange={(e) =>
                          patchMeta({ two_factor_contact: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="契約ID / 契約番号">
                      <input
                        value={loginDraft.meta.contract_id}
                        onChange={(e) => patchMeta({ contract_id: e.target.value })}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="プランID / 利用プラン">
                      <input
                        value={loginDraft.meta.plan_id}
                        onChange={(e) => patchMeta({ plan_id: e.target.value })}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="求人票ID（カンマ区切り）">
                      <input
                        value={loginDraft.meta.job_posting_ids}
                        onChange={(e) =>
                          patchMeta({ job_posting_ids: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="求人名 / 原稿名">
                      <input
                        value={loginDraft.meta.job_posting_names}
                        onChange={(e) =>
                          patchMeta({ job_posting_names: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="スカウトテンプレートID">
                      <input
                        value={loginDraft.meta.scout_template_ids}
                        onChange={(e) =>
                          patchMeta({ scout_template_ids: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="候補者検索URL">
                      <input
                        value={loginDraft.meta.target_search_url}
                        onChange={(e) =>
                          patchMeta({ target_search_url: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="1日送信上限">
                      <input
                        value={loginDraft.meta.daily_send_limit}
                        onChange={(e) =>
                          patchMeta({ daily_send_limit: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="実行時間帯">
                      <input
                        value={loginDraft.meta.operation_window}
                        onChange={(e) =>
                          patchMeta({ operation_window: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="送信者名">
                      <input
                        value={loginDraft.meta.sender_name}
                        onChange={(e) => patchMeta({ sender_name: e.target.value })}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="送信元メールアドレス">
                      <input
                        value={loginDraft.meta.sender_email}
                        onChange={(e) =>
                          patchMeta({ sender_email: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="返信先 / 問い合わせ先">
                      <input
                        value={loginDraft.meta.reply_to}
                        onChange={(e) => patchMeta({ reply_to: e.target.value })}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="最終接続確認日">
                      <input
                        type="date"
                        value={loginDraft.meta.last_verified_at}
                        onChange={(e) =>
                          patchMeta({ last_verified_at: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="運用状態">
                      <select
                        value={loginDraft.meta.status}
                        onChange={(e) =>
                          patchMeta({ status: e.target.value as LoginStatus })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                      >
                        <option value="needs_check">要確認</option>
                        <option value="ready">送信可能</option>
                        <option value="paused">停止中</option>
                      </select>
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="候補者検索条件">
                        <textarea
                          rows={3}
                          value={loginDraft.meta.target_conditions}
                          onChange={(e) =>
                            patchMeta({ target_conditions: e.target.value })
                          }
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          placeholder="例）営業経験2年以上、東京都、転職意欲高、最終ログイン30日以内"
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="除外条件・重複送信ルール">
                        <textarea
                          rows={3}
                          value={loginDraft.meta.exclusion_rules}
                          onChange={(e) =>
                            patchMeta({ exclusion_rules: e.target.value })
                          }
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="2段階認証・媒体固有メモ">
                        <textarea
                          rows={3}
                          value={loginDraft.meta.two_factor_note}
                          onChange={(e) =>
                            patchMeta({ two_factor_note: e.target.value })
                          }
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="運用メモ">
                        <textarea
                          rows={3}
                          value={loginDraft.meta.note}
                          onChange={(e) => patchMeta({ note: e.target.value })}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={saveLogin}
                      className="rounded-lg border border-neutral-900 bg-neutral-950 px-3 py-2 text-sm text-white hover:bg-neutral-800"
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
                      パスワードは既存テーブルへ保存します。本番ではKMS/Secretsへの移行を推奨します。
                    </span>
                  </div>
                </SurfaceCard>

                <div className="grid gap-3 md:grid-cols-4">
                  <StatChip label="登録媒体" value={logins.length} />
                  <StatChip label="送信可能" value={readyCount} />
                  <StatChip label="要確認" value={logins.length - readyCount} />
                  <StatChip label="クライアント" value={selectedClient.client_name} />
                </div>

                <DataTableCard>
                  <div className="overflow-x-auto">
                    <table className="min-w-[980px] w-full text-sm">
                      <thead className="bg-neutral-50 text-neutral-600">
                        <tr>
                          <th className="px-3 py-3 text-left">媒体</th>
                          <th className="px-3 py-3 text-left">状態</th>
                          <th className="px-3 py-3 text-left">ログインID</th>
                          <th className="px-3 py-3 text-left">求人票ID</th>
                          <th className="px-3 py-3 text-left">検索条件</th>
                          <th className="px-3 py-3 text-left">上限/時間帯</th>
                          <th className="px-3 py-3 text-left">更新日時</th>
                          <th className="px-3 py-3 text-left">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {savedMetas.map(({ row, meta }) => (
                          <tr key={row.id}>
                            <td className="px-3 py-2">
                              {SITE_LABEL_MAP[row.site_key] || row.site_key}
                            </td>
                            <td className="px-3 py-2">
                              <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
                                {statusLabel(meta.status)}
                              </span>
                            </td>
                            <td className="px-3 py-2">{row.username}</td>
                            <td className="px-3 py-2">
                              {meta.job_posting_ids || "-"}
                            </td>
                            <td className="px-3 py-2 max-w-[240px] truncate">
                              {meta.target_conditions || meta.target_search_url || "-"}
                            </td>
                            <td className="px-3 py-2">
                              {meta.daily_send_limit || "-"} /{" "}
                              {meta.operation_window || "-"}
                            </td>
                            <td className="px-3 py-2">
                              {row.updated_at?.replace("T", " ").replace("Z", "")}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => editLogin(row)}
                                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                                >
                                  編集
                                </button>
                                <button
                                  onClick={() => deleteLogin(row.id)}
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
                              colSpan={8}
                              className="px-4 py-10 text-center text-neutral-400"
                            >
                              ログイン情報がありません
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </DataTableCard>
              </>
            )}
          </div>
        </div>

        {msg && (
          <SurfaceCard>
            <pre className="whitespace-pre-wrap text-xs text-red-600">{msg}</pre>
          </SurfaceCard>
        )}
      </PageMain>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-neutral-600">{label}</div>
      {children}
    </label>
  );
}
