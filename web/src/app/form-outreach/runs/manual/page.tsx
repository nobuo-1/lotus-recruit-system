// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Bug,
} from "lucide-react";

const PAGE_SIZE = 10;
type Dataset = "prospects" | "rejected" | "similar";
const DATASET_TO_TABLE: Record<Dataset, string> = {
  prospects: "form_prospects",
  rejected: "form_prospects_rejected",
  similar: "form_similar_sites",
};

async function fetchTenantId(): Promise<string | null> {
  try {
    let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
    if (!meRes.ok)
      meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
    const me = await meRes.json().catch(() => ({}));
    return me?.tenant_id ?? me?.profile?.tenant_id ?? null;
  } catch {
    return null;
  }
}

type BaseRow = {
  id: string;
  tenant_id: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  email_sent?: boolean | null;
  form_sent?: boolean | null;
};

type ProsRow = BaseRow & {
  company_name: string | null;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  status?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RejRow = BaseRow & {
  corporate_number: string | null;
  company_name: string | null;
  website: string | null;
  phone: string | null;
  industry_large: string | null;
  industry_small: string | null;
  company_size: string | null;
  company_size_extracted: string | null;
  prefectures: string[] | null;
  hq_address: string | null;
  capital: number | null;
  established_on: string | null;
  source_site: string | null;
  reject_reasons: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type SimRow = BaseRow & {
  target_corporate_number: string | null;
  target_company_name: string | null;
  target_hq_address: string | null;
  found_company_name: string | null;
  found_website: string | null;
  source_site: string | null;
  matched_addr: boolean | null;
  matched_company_ratio: number | null;
  phone: string | null;
  reasons: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type AnyRow = ProsRow | RejRow | SimRow;

type TemplateRow = {
  id: string;
  name: string | null;
  subject: string | null;
  channel: string | null;
  created_at: string | null;
};

/** フォーム送信デバッグ用（API の debug フィールドをそのまま保持） */
type FormDebugItem = {
  prospectId: string;
  companyName: string;
  formUrl?: string | null;
  data: any; // { canAccessForm, inputTotal, inputFilled, ... } を想定
};

function ellipsize(u?: string | null, max = 54) {
  const s = u || "";
  if (s.length <= max) return s;
  const head = Math.max(0, Math.floor((max - 1) * 0.65));
  const tail = Math.max(0, max - 1 - head);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
function pickCompanyName(row: AnyRow) {
  return (
    (row as any).company_name ||
    (row as any).target_company_name ||
    (row as any).found_company_name ||
    "-"
  );
}
function channelOf(row: AnyRow): "form" | "email" | "both" | "-" {
  const hasForm = !!String((row as any).contact_form_url || "").trim();
  const hasMail = !!String((row as any).contact_email || "").trim();
  if (hasForm && hasMail) return "both";
  if (hasForm) return "form";
  if (hasMail) return "email";
  return "-";
}

/** 〇/×/− のバッジ */
function StatusBadge(props: {
  value: boolean | null | undefined;
  label?: string;
}) {
  const { value, label } = props;
  if (value === true) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 border border-emerald-200">
        〇{label ? `：${label}` : ""}
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 border border-red-200">
        ×{label ? `：${label}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-50 px-2 py-0.5 text-xs text-neutral-500 border border-neutral-200">
      －{label ? `：${label}` : ""}
    </span>
  );
}

/** N/M 完了 表示用 */
function ratioText(done?: number | null, total?: number | null) {
  if (total == null) return "―";
  if (done == null) return `? / ${total}`;
  return `${done} / ${total}`;
}

export default function ManualRunsPage() {
  const router = useRouter();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset>("prospects");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [channelFilter, setChannelFilter] = useState<
    "all" | "form" | "email" | "both"
  >("all");

  // 送信済みフラグ用フィルタ
  const [emailSentFilter, setEmailSentFilter] = useState<
    "all" | "sent" | "unsent"
  >("all");
  const [formSentFilter, setFormSentFilter] = useState<
    "all" | "sent" | "unsent"
  >("all");

  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [showTplModal, setShowTplModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  const [unknownPlaceholder, setUnknownPlaceholder] =
    useState("メッセージをご確認ください");

  // 送信モード（メール or フォーム）
  const [sendMode, setSendMode] = useState<"email" | "form">("email");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allChecked =
    rows.length > 0 && rows.every((r) => selected.has((r as any).id));

  // ★ フォーム送信デバッグ情報
  const [debugItems, setDebugItems] = useState<FormDebugItem[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(true);
  const [lastRawResponse, setLastRawResponse] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const t = await fetchTenantId();
      setTenantId(t);
      try {
        const tr = await fetch("/api/form-outreach/templates", {
          headers: { "x-tenant-id": t || "" },
          cache: "no-store",
        });
        const tj = await tr.json();
        if (tr.ok) setTemplates(tj.rows ?? []);
      } catch {
        // ignore
      }
    })();
  }, []);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMsg("");
    try {
      const qs = new URLSearchParams();
      qs.set("table", DATASET_TO_TABLE[dataset]);
      qs.set("limit", String(PAGE_SIZE));
      qs.set("page", String(page));
      qs.set("sort", sortKey);
      qs.set("dir", sortDir);
      if (q.trim()) qs.set("q", q.trim());
      if (channelFilter === "email") qs.set("email", "has");
      if (channelFilter === "form") qs.set("form", "has");
      const resp = await fetch(
        `/api/form-outreach/companies?${qs.toString()}`,
        {
          headers: { "x-tenant-id": String(tenantId) },
          cache: "no-store",
        }
      );
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error || "fetch failed");
      let arr: AnyRow[] = j.rows ?? [];

      if (channelFilter === "both")
        arr = arr.filter((r) => channelOf(r) === "both");
      if (q.trim()) {
        const qq = q.trim().toLowerCase();
        arr = arr.filter((r) => {
          const name = String(pickCompanyName(r) || "").toLowerCase();
          const web = String(
            (r as any).website || (r as any).found_website || ""
          ).toLowerCase();
          const mail = String((r as any).contact_email || "").toLowerCase();
          return name.includes(qq) || web.includes(qq) || mail.includes(qq);
        });
      }

      // メール送信フラグフィルタ
      if (emailSentFilter === "sent") {
        arr = arr.filter((r) => !!(r as any).email_sent);
      } else if (emailSentFilter === "unsent") {
        arr = arr.filter((r) => !(r as any).email_sent);
      }

      // フォーム送信フラグフィルタ
      if (formSentFilter === "sent") {
        arr = arr.filter((r) => !!(r as any).form_sent);
      } else if (formSentFilter === "unsent") {
        arr = arr.filter((r) => !(r as any).form_sent);
      }

      setRows(arr);
      setTotal(Number(j.total || arr.length || 0));
      // 選択状態は維持（ページ跨いでもそのまま）
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [
    tenantId,
    dataset,
    page,
    sortKey,
    sortDir,
    channelFilter,
    emailSentFilter,
    formSentFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((p) => (p as any).id)));
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const sortIcon = (key: string) => {
    if (sortKey !== key)
      return <ArrowUpDown className="h-3.5 w-3.5 text-neutral-400" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-neutral-800" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-neutral-800" />
    );
  };
  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const [executing, setExecuting] = useState(false);

  const handleExecute = async () => {
    setMsg("");
    setDebugItems([]);
    setLastRawResponse(null);

    if (!tenantId) return;
    if (selected.size === 0) return setMsg("対象の企業を選択してください。");
    if (!selectedTemplateId) return setMsg("テンプレートを選択してください。");

    setExecuting(true);
    try {
      const r = await fetch("/api/form-outreach/manual/send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          channel: sendMode, // メール or フォーム
          table: DATASET_TO_TABLE[dataset],
          template_id: selectedTemplateId,
          prospect_ids: Array.from(selected),
          unknown_placeholder: unknownPlaceholder,
        }),
      });
      const j = await r.json();
      setLastRawResponse(j);

      if (!r.ok) throw new Error(j?.error || "manual send failed");

      setMsg(
        `成功:${j.ok?.length || 0} / 待機:${j.queued?.length || 0} / 失敗:${
          j.failed?.length || 0
        }`
      );

      // ★ フォーム営業モードのときだけデバッグ情報を拾う想定
      if (sendMode === "form" && j.debug) {
        const debugMap = j.debug as Record<string, any>;
        const list: FormDebugItem[] = [];

        for (const id of Array.from(selected)) {
          const row = rows.find((r) => (r as any).id === id) as AnyRow | null;
          const companyName = row ? pickCompanyName(row) : id;
          const formUrl = (row as any)?.contact_form_url ?? null;
          const data = debugMap?.[id] ?? null;

          list.push({
            prospectId: id,
            companyName,
            formUrl,
            data,
          });
        }
        setDebugItems(list);
        setShowDebugPanel(true);
      }

      // メールモードのときは従来どおり実行ログへ遷移
      if (sendMode === "email") {
        router.push("/form-outreach/schedules");
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-7xl p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              メッセージ手動送信
            </h1>
            <p className="text-sm text-neutral-500">
              3テーブル切替 / 検索 / 10件ページング。
              テンプレ選択→送信モード選択→「実行」で送信。
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/form-outreach"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              フォーム営業トップ
            </Link>
            <Link
              href="/form-outreach/waitlist"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              待機リスト
            </Link>
            <Link
              href="/form-outreach/schedules"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              実行ログ
            </Link>
            <Link
              href="/form-outreach/templates"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              テンプレート管理
            </Link>
          </div>
        </div>

        {/* タブ */}
        <div className="mb-3 inline-flex rounded-lg border border-neutral-200 overflow-hidden">
          {(["prospects", "rejected", "similar"] as Dataset[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setDataset(t);
                setPage(1);
              }}
              className={`px-3 py-2 text-sm border-r border-neutral-200 last:border-r-0 ${
                dataset === t
                  ? "bg-neutral-100 font-medium"
                  : "bg-white hover:bg-neutral-50"
              }`}
            >
              {t === "prospects"
                ? "正規企業リスト"
                : t === "rejected"
                ? "不備企業リスト"
                : "近似サイトリスト"}
            </button>
          ))}
        </div>

        {/* フィルタ */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-3 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-neutral-600 mb-1">
                キーワード
              </label>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="社名 / URL / メール"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">
                チャンネル
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value as any)}
              >
                <option value="all">すべて</option>
                <option value="form">フォームのみ</option>
                <option value="email">メールのみ</option>
                <option value="both">両方可</option>
              </select>
            </div>

            {/* メール送信フラグ */}
            <div>
              <label className="block text-xs text-neutral-600 mb-1">
                メール送信
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={emailSentFilter}
                onChange={(e) =>
                  setEmailSentFilter(
                    e.target.value as "all" | "sent" | "unsent"
                  )
                }
              >
                <option value="all">指定なし</option>
                <option value="sent">送信済のみ</option>
                <option value="unsent">未送信のみ</option>
              </select>
            </div>

            {/* フォーム送信フラグ */}
            <div>
              <label className="block text-xs text-neutral-600 mb-1">
                フォーム送信
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={formSentFilter}
                onChange={(e) =>
                  setFormSentFilter(e.target.value as "all" | "sent" | "unsent")
                }
              >
                <option value="all">指定なし</option>
                <option value="sent">送信済のみ</option>
                <option value="unsent">未送信のみ</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-neutral-600 mb-1">
                未確定項目プレースホルダ
              </label>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={unknownPlaceholder}
                onChange={(e) => setUnknownPlaceholder(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                setPage(1);
                load();
              }}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              フィルタを適用
            </button>
            <button
              onClick={() => {
                setQ("");
                setChannelFilter("all");
                setEmailSentFilter("all");
                setFormSentFilter("all");
                setUnknownPlaceholder("メッセージをご確認ください");
                setPage(1);
                load();
              }}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              リセット
            </button>
          </div>
        </section>

        {/* テンプレ＋送信モード＋実行 */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowTplModal(true)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            テンプレートを選択
          </button>
          <span className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
            {selectedTemplate?.name || "テンプレ未選択"}
          </span>

          {/* 送信モード */}
          <div className="ml-3 inline-flex items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="sendmode"
                checked={sendMode === "email"}
                onChange={() => setSendMode("email")}
              />
              <span>メールで送る</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="sendmode"
                checked={sendMode === "form"}
                onChange={() => setSendMode("form")}
              />
              <span>営業フォームで送る</span>
            </label>
          </div>

          <button
            onClick={handleExecute}
            disabled={executing || !selectedTemplateId || selected.size === 0}
            className="ml-auto rounded-lg border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {executing ? "実行中…" : "実行"}
          </button>
          <div className="text-sm text-neutral-700">
            選択件数:{" "}
            <span className="font-semibold text-neutral-900">
              {selected.size}
            </span>
          </div>
        </div>

        {/* テーブル */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => toggleSort("company_name")}
                    >
                      社名{sortIcon("company_name")}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => toggleSort("website")}
                    >
                      サイトURL{sortIcon("website")}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => toggleSort("contact_email")}
                    >
                      メール{sortIcon("contact_email")}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">フォーム</th>
                  <th className="px-3 py-3 text-left">業種</th>
                  <th className="px-3 py-3 text-left">規模</th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => toggleSort("created_at")}
                    >
                      取得日時{sortIcon("created_at")}
                    </button>
                  </th>
                  {/* 送信状況列 */}
                  <th className="px-3 py-3 text-left">送信状況</th>
                  <th className="px-3 py-3 text-left">チャンネル</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rows.map((r) => {
                  const id = (r as any).id;
                  const name = pickCompanyName(r);
                  const web =
                    (r as any).website || (r as any).found_website || "";
                  const mail = (r as any).contact_email || "";
                  const form = (r as any).contact_form_url || "";
                  const industry =
                    (r as any).industry ||
                    (r as any).industry_large ||
                    (r as any).industry_small ||
                    "";
                  const size =
                    (r as any).company_size ||
                    (r as any).company_size_extracted ||
                    "";
                  const created = (r as any).created_at
                    ? String((r as any).created_at)
                        .replace("T", " ")
                        .replace("Z", "")
                    : "-";
                  const ch = channelOf(r);
                  const chLabel =
                    ch === "both"
                      ? "両方"
                      : ch === "form"
                      ? "フォーム"
                      : ch === "email"
                      ? "メール"
                      : "-";

                  const emailSent = !!(r as any).email_sent;
                  const formSent = !!(r as any).form_sent;

                  return (
                    <tr key={id}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleOne(id)}
                          aria-label={`${name} を選択`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-[18ch] truncate">
                          {name || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {web ? (
                          <a
                            href={web}
                            target="_blank"
                            className="text-indigo-700 hover:underline break-all"
                          >
                            {ellipsize(web)}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">{mail || "-"}</td>
                      <td className="px-3 py-2">{form ? "あり" : "なし"}</td>
                      <td className="px-3 py-2">
                        <div className="max-w-[18ch] truncate">
                          {industry || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2">{size || "-"}</td>
                      <td className="px-3 py-2">{created}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1 text-xs">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 ${
                              emailSent
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-neutral-200 bg-neutral-50 text-neutral-500"
                            }`}
                          >
                            メール
                            {emailSent ? "済" : "未"}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 ${
                              formSent
                                ? "border-sky-300 bg-sky-50 text-sky-700"
                                : "border-neutral-200 bg-neutral-50 text-neutral-500"
                            }`}
                          >
                            フォーム
                            {formSent ? "済" : "未"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">{chLabel}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      対象がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
            <div className="text-xs text-neutral-500">
              全 {total} 件 / {page} / {totalPages} ページ（{PAGE_SIZE}
              件/ページ）
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                前へ
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                次へ
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* メッセージ */}
        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}

        {/* ★ フォーム送信デバッグパネル */}
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 border border-amber-300">
                <Bug className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <div className="text-sm font-semibold text-amber-900">
                  フォーム送信デバッグ
                </div>
                <p className="text-xs text-amber-800">
                  「営業フォームで送る」で実行したときの各ステップ
                  （アクセス・入力欄数・reCAPTCHA・送信成否など）を可視化します。
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDebugPanel((v) => !v)}
              className="text-xs rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 hover:bg-amber-200"
            >
              {showDebugPanel ? "折りたたむ" : "展開する"}
            </button>
          </div>

          {showDebugPanel && (
            <div className="mt-3 space-y-3">
              {debugItems.length === 0 && (
                <p className="text-xs text-amber-800">
                  まだフォーム送信デバッグ情報はありません。
                  <br />
                  「営業フォームで送る」を選択して実行し、サーバー側の
                  /api/form-outreach/manual/send がレスポンスに{" "}
                  <code className="rounded bg-amber-100 px-1">debug</code>{" "}
                  フィールド （各 prospect_id
                  ごとにステータスを持つオブジェクト）を返すと、
                  ここに各段階が表示されます。
                </p>
              )}

              {debugItems.map((item) => {
                const d = item.data || {};
                // サーバー側のキー名に多少ゆらぎがあっても拾えるように冗長に読む
                const canAccessForm =
                  d.canAccessForm ?? d.form_accessible ?? d.page_ok;
                const hasCaptcha =
                  d.hasCaptcha ?? d.captchaDetected ?? d.captcha;
                const hasActionButton =
                  d.hasActionButton ??
                  d.hasConfirmOrSubmit ??
                  d.hasSubmitButton;
                const clickedConfirm =
                  d.clickedConfirm ?? d.confirmClicked ?? null;
                const clickedSubmit =
                  d.clickedSubmit ?? d.submitClicked ?? null;
                const sentStatus =
                  d.sentStatus ?? d.result ?? d.judge ?? d.status ?? null;

                const inputTotal =
                  d.inputTotal ?? d.inputs_total ?? d.input_count ?? null;
                const inputFilled =
                  d.inputFilled ?? d.inputs_filled ?? d.filled_inputs ?? null;

                const selectTotal =
                  d.selectTotal ?? d.selects_total ?? d.select_count ?? null;
                const selectFilled =
                  d.selectFilled ??
                  d.selects_filled ??
                  d.filled_selects ??
                  null;

                const checkboxTotal =
                  d.checkboxTotal ??
                  d.checkboxes_total ??
                  d.checkbox_count ??
                  null;
                const checkboxFilled =
                  d.checkboxFilled ??
                  d.checkboxes_filled ??
                  d.filled_checkboxes ??
                  null;

                let sentLabel: string;
                if (sentStatus === "success") sentLabel = "送信成功";
                else if (sentStatus === "failure") sentLabel = "送信失敗";
                else if (sentStatus === "unknown") sentLabel = "判定不明";
                else sentLabel = "―";

                return (
                  <div
                    key={item.prospectId}
                    className="rounded-xl border border-amber-200 bg-white/80 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">
                          {item.companyName}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          ID: {item.prospectId}
                        </div>
                        {item.formUrl && (
                          <a
                            href={item.formUrl}
                            target="_blank"
                            className="text-xs text-indigo-700 hover:underline break-all"
                          >
                            フォームURL: {item.formUrl}
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-neutral-600">
                        最終判定:{" "}
                        <span className="font-semibold">{sentLabel}</span>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {/* 左カラム：アクセス・reCAPTCHA・ボタン */}
                      <div className="space-y-1.5 text-xs">
                        <div>
                          <span className="font-semibold">
                            フォームにアクセスできたか：
                          </span>{" "}
                          <StatusBadge value={canAccessForm} />
                        </div>
                        <div>
                          <span className="font-semibold">
                            reCAPTCHA / hCaptcha 検知：
                          </span>{" "}
                          <StatusBadge value={hasCaptcha} />
                        </div>
                        <div>
                          <span className="font-semibold">
                            送信 / 確認ボタンがあったか：
                          </span>{" "}
                          <StatusBadge value={hasActionButton} />
                        </div>
                        <div>
                          <span className="font-semibold">
                            確認ボタンを押せたか：
                          </span>{" "}
                          <StatusBadge value={clickedConfirm} />
                        </div>
                        <div>
                          <span className="font-semibold">
                            送信ボタンを押せたか：
                          </span>{" "}
                          <StatusBadge value={clickedSubmit} />
                        </div>
                      </div>

                      {/* 右カラム：入力欄カウント */}
                      <div className="space-y-1.5 text-xs">
                        <div>
                          <span className="font-semibold">インプット欄：</span>{" "}
                          {ratioText(inputFilled, inputTotal)}{" "}
                          <span className="text-[10px] text-neutral-500">
                            （入力済 / 総数）
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold">
                            選択（select）欄：
                          </span>{" "}
                          {ratioText(selectFilled, selectTotal)}{" "}
                          <span className="text-[10px] text-neutral-500">
                            （入力済 / 総数）
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold">
                            チェックボックス：
                          </span>{" "}
                          {ratioText(checkboxFilled, checkboxTotal)}{" "}
                          <span className="text-[10px] text-neutral-500">
                            （オンにできた数 / 総数）
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 生の debug JSON（必要なときだけ開く） */}
                    {item.data && (
                      <details className="mt-2 text-[11px] text-neutral-600">
                        <summary className="cursor-pointer select-none">
                          生のデバッグデータを表示
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded bg-neutral-900 px-2 py-1 text-[10px] text-neutral-50">
                          {JSON.stringify(item.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}

              {/* 最後にレスポンス全体の JSON を確認できるようにする */}
              {lastRawResponse && (
                <details className="mt-2 text-[11px] text-neutral-700">
                  <summary className="cursor-pointer select-none">
                    /api/form-outreach/manual/send のレスポンス全体
                  </summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-neutral-900 px-2 py-1 text-[10px] text-neutral-50">
                    {JSON.stringify(lastRawResponse, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </section>
      </main>

      {/* テンプレ選択モーダル */}
      {showTplModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setShowTplModal(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold text-neutral-800">
                テンプレートを選択
              </div>
              <button
                onClick={() => setShowTplModal(false)}
                className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
              >
                閉じる
              </button>
            </div>
            <div className="max-h-80 overflow-auto rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="px-3 py-2 text-left">名前</th>
                    <th className="px-3 py-2 text-left">チャンネル</th>
                    <th className="px-3 py-2 text-left">件名</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2">{t.name || "-"}</td>
                      <td className="px-3 py-2">{t.channel || "-"}</td>
                      <td className="px-3 py-2 truncate max-w-[240px]">
                        {t.subject || "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            setSelectedTemplateId(t.id);
                            setShowTplModal(false);
                          }}
                          className="rounded-lg border border-neutral-200 px-3 py-1 text-xs hover:bg-neutral-50"
                        >
                          選択
                        </button>
                      </td>
                    </tr>
                  ))}
                  {templates.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-10 text-center text-neutral-400"
                      >
                        テンプレートがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-neutral-600">
              現在の選択：{" "}
              <span className="font-medium">
                {selectedTemplate?.name || "未選択"}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
