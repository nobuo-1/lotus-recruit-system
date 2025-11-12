// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

// ====== 設定 ======
const PAGE_SIZE = 10;

type Dataset = "prospects" | "rejected" | "similar";
const DATASET_TO_TABLE: Record<Dataset, string> = {
  prospects: "form_prospects",
  rejected: "form_prospects_rejected",
  similar: "form_similar_sites",
};

// テナント取得ヘルパ
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

type ProsRow = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  status?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RejRow = {
  id: string;
  tenant_id: string | null;
  corporate_number: string | null;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  phone: string | null;
  contact_form_url: string | null;
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

type SimRow = {
  id: string;
  tenant_id: string | null;
  target_corporate_number: string | null;
  target_company_name: string | null;
  target_hq_address: string | null;
  found_company_name: string | null;
  found_website: string | null;
  source_site: string | null;
  matched_addr: boolean | null;
  matched_company_ratio: number | null;
  contact_form_url: string | null;
  contact_email: string | null;
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
  channel: string | null; // "email" | "form" | "both"
  created_at: string | null;
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

export default function ManualRunsPage() {
  // === テナント / データセット / ページング ===
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset>("prospects");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // === フィルタ（最低限） ===
  const [q, setQ] = useState("");
  const [channelFilter, setChannelFilter] = useState<
    "all" | "form" | "email" | "both"
  >("all");

  // === 並び替え ===
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // === データ ===
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // === テンプレ ===
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [showTplModal, setShowTplModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  // フォーム用プレースホルダ編集（UIから可変）
  const [unknownPlaceholder, setUnknownPlaceholder] =
    useState("メッセージをご確認ください");

  // === 選択状態 ===
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allChecked =
    rows.length > 0 && rows.every((r) => selected.has((r as any).id));

  // 初期ロード：tenantId & テンプレ
  useEffect(() => {
    (async () => {
      setTenantId(await fetchTenantId());
      try {
        const tr = await fetch("/api/form-outreach/templates", {
          headers: { "x-tenant-id": (await fetchTenantId()) || "" },
          cache: "no-store",
        });
        const tj = await tr.json();
        if (tr.ok) setTemplates(tj.rows ?? []);
      } catch {
        // 無視
      }
    })();
  }, []);

  // データロード
  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMsg("");
    try {
      const qs = new URLSearchParams();
      qs.set("table", DATASET_TO_TABLE[dataset]); // 明示テーブル名
      qs.set("limit", String(PAGE_SIZE));
      qs.set("page", String(page));
      qs.set("sort", sortKey);
      qs.set("dir", sortDir);
      if (q.trim()) qs.set("q", q.trim());

      // チャンネルフィルタ → APIには email/form の有無で投げる
      if (channelFilter === "email") qs.set("email", "has");
      if (channelFilter === "form") qs.set("form", "has");
      if (channelFilter === "both") {
        // APIは同時指定のANDが難しいため、まず全件取得→フロント側で絞る
      }

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

      // both フィルタはフロント側で
      if (channelFilter === "both") {
        arr = arr.filter((r: AnyRow) => channelOf(r) === "both");
      }

      // q の見落とし防止（API側で検索しているが安全のため）
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

      setRows(arr);
      setTotal(Number(j.total || arr.length || 0));
      setSelected(new Set()); // ページ切替時は選択解除
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, dataset, page, sortKey, sortDir, channelFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((p) => (p as any).id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

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

  // 実行
  const [executing, setExecuting] = useState(false);
  const handleExecute = async () => {
    setMsg("");
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
          table: DATASET_TO_TABLE[dataset],
          template_id: selectedTemplateId,
          prospect_ids: Array.from(selected),
          unknown_placeholder: unknownPlaceholder,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "manual send failed");

      // 成功分は prospects の status を "sent" に（可能な範囲で）
      if (dataset === "prospects" && j.ok?.length) {
        await fetch("/api/form-outreach/prospects/status", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": tenantId,
          },
          body: JSON.stringify({ prospect_ids: j.ok, status: "sent" }),
        }).catch(() => {});
      }

      setMsg(
        `送信成功: ${j.ok?.length || 0} / 待機追加: ${
          j.queued?.length || 0
        } / 失敗: ${j.failed?.length || 0}`
      );

      // 最新状態で再読込
      await load();
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
        {/* ヘッダ */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              メッセージ手動送信
            </h1>
            <p className="text-sm text-neutral-500">
              3テーブル切替 / 検索 / 10件ページング。テンプレ選択→「実行」で
              メール送信 or 営業フォームは待機リストへ。
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/form-outreach/waitlist"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              title="待機リストを開く"
            >
              待機リスト
            </Link>
            <Link
              href="/form-outreach/templates"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              title="テンプレートを管理"
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
                onChange={(e) =>
                  setChannelFilter(
                    e.target.value as "all" | "form" | "email" | "both"
                  )
                }
              >
                <option value="all">すべて</option>
                <option value="form">フォームのみ</option>
                <option value="email">メールのみ</option>
                <option value="both">両方可</option>
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

        {/* テンプレ選択バー */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowTplModal(true)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            テンプレートを選択
          </button>
          <span className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
            {selectedTemplate?.name || "未選択"}
          </span>

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

        {/* テーブル（companiesと同じトーン：ヘッダ text-neutral-600） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">
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
                      社名
                      {sortIcon("company_name")}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => toggleSort("website")}
                    >
                      サイトURL
                      {sortIcon("website")}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => toggleSort("contact_email")}
                    >
                      メール
                      {sortIcon("contact_email")}
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
                      取得日時
                      {sortIcon("created_at")}
                    </button>
                  </th>
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
                      <td className="px-3 py-2">{chLabel}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      対象がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ページネーション（companiesと同トーン） */}
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

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
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
