// web/src/app/form-outreach/waitlist/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DataTableCard, PageHero, PageMain, StatChip, SurfaceCard } from "@/components/PageChrome";

type WaitRow = {
  id: string;
  tenant_id: string | null;
  table_name: string | null;
  prospect_id: string | null;
  reason: string | null; // queue_form / recaptcha / error / no_email など
  status?: string | null; // waiting / failed / done
  payload?: any | null;
  created_at: string | null;
  updated_at: string | null;
  tries?: number | null;
  last_error?: string | null;
};

const PAGE_SIZE = 10;

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

/** ISO文字列を日本時間表示に整形 */
function formatJst(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // 一応、壊れた文字列も見やすく
    return iso.replace("T", " ").replace("Z", "");
  }
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
  });
}

export default function WaitlistPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [rows, setRows] = useState<WaitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    (async () => setTenantId(await fetchTenantId()))();
  }, []);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMsg("");
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      qs.set("page", String(page));
      if (q.trim()) qs.set("q", q.trim());
      if (reasonFilter) qs.set("reason", reasonFilter);
      if (statusFilter) qs.set("status", statusFilter);
      const r = await fetch(`/api/form-outreach/waitlist?${qs.toString()}`, {
        headers: { "x-tenant-id": tenantId },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
      setTotal(j.total ?? j.rows?.length ?? 0);
      setSelected(new Set());
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
  }, [tenantId, page]);

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const retrySelected = async () => {
    if (!tenantId || selected.size === 0) return;
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/waitlist/retry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "retry failed");
      setMsg(
        `再試行 成功:${j.ok?.length || 0} / 待機:${
          j.waiting?.length || 0
        } / 失敗:${j.failed?.length || 0}`
      );
      await load();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const deleteSelected = async () => {
    if (!tenantId || selected.size === 0) return;
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/waitlist/delete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "delete failed");
      setMsg(`削除 ${j.deleted || 0} 件`);
      await load();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const applyFilters = () => {
    setPage(1);
    load();
  };

  const reasonLabel = (reason: string | null | undefined) => {
    if (reason === "recaptcha") return "手動入力が必要";
    if (reason === "queue_form") return "自動判定不可";
    if (reason === "no_form") return "フォームURLなし";
    if (reason === "no_email") return "メールなし";
    return reason || "-";
  };

  const actionLabel = (reason: string | null | undefined) => {
    if (reason === "recaptcha") return "フォームを開いて手動送信";
    if (reason === "queue_form") return "内容確認後に再試行または手動送信";
    if (reason === "no_form") return "企業URLからフォームを確認";
    if (reason === "no_email") return "メールアドレス確認";
    return "確認";
  };

  return (
    <PageMain className="space-y-6">
      <PageHero
        eyebrow="Waitlist"
        title="手動対応リスト"
        description="reCAPTCHA などの自動送信バリア、送信判定が不明なフォーム、フォームURL不足の対象を仕分けして確認できます。"
        accent="rose"
        actions={[
          { href: "/form-outreach/form-send", label: "フォーム一斉送信", variant: "secondary" },
          { href: "/form-outreach/companies/fetch", label: "企業リスト手動取得へ", variant: "secondary" },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <StatChip label="総件数" value={total} />
        <StatChip label="選択件数" value={selected.size} />
        <StatChip label="表示ページ" value={`${page} / ${totalPages}`} />
        <StatChip label="テナント" value={tenantId ?? "-"} />
      </div>

      <SurfaceCard className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="会社名 / ID / エラー"
          className="w-56 rounded-2xl border border-neutral-200 px-3 py-2 text-sm"
        />
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">理由すべて</option>
          <option value="recaptcha">手動入力が必要</option>
          <option value="queue_form">自動判定不可</option>
          <option value="no_form">フォームURLなし</option>
          <option value="no_email">メールなし</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">状態すべて</option>
          <option value="waiting">waiting</option>
          <option value="failed">failed</option>
          <option value="done">done</option>
        </select>
        <button
          onClick={applyFilters}
          className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
        >
          絞り込み
        </button>
        <button
          onClick={retrySelected}
          disabled={selected.size === 0}
          className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          選択を再試行
        </button>
        <button
          onClick={deleteSelected}
          disabled={selected.size === 0}
          className="rounded-2xl border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          選択を削除
        </button>
        <button
          onClick={() => load()}
          className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
        >
          更新
        </button>
      </SurfaceCard>

      <DataTableCard>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-3 text-left">登録日時（日本時間）</th>
                  <th className="px-3 py-3 text-left">対象テーブル</th>
                  <th className="px-3 py-3 text-left">Prospect ID</th>
                  <th className="px-3 py-3 text-left">会社名</th>
                  <th className="px-3 py-3 text-left">フォームURL</th>
                  <th className="px-3 py-3 text-left">理由</th>
                  <th className="px-3 py-3 text-left">対応方針</th>
                  <th className="px-3 py-3 text-left">状態</th>
                  <th className="px-3 py-3 text-left">試行/エラー</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rows.map((w) => {
                  const created = formatJst(w.created_at);
                  const ctx = (w.payload?.context || {}) as any;
                  const company =
                    ctx?.recipient_company || w.payload?.company_name || "-";
                  const formUrl =
                    w.payload?.form_url ||
                    w.payload?.formUrl ||
                    w.payload?.form ||
                    "-";
                  const st = w.status || "waiting";
                  const tries =
                    typeof w.tries === "number" ? String(w.tries) : "-";
                  const err = w.last_error ? String(w.last_error) : "-";
                  return (
                    <tr key={w.id}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(w.id)}
                          onChange={() => toggleOne(w.id)}
                        />
                      </td>
                      <td className="px-3 py-2">{created}</td>
                      <td className="px-3 py-2">{w.table_name || "-"}</td>
                      <td className="px-3 py-2 font-mono">
                        {w.prospect_id || "-"}
                      </td>
                      <td className="px-3 py-2">{company}</td>
                      <td className="px-3 py-2">
                        {formUrl && formUrl !== "-" ? (
                          <a
                            href={formUrl}
                            target="_blank"
                            className="text-indigo-700 hover:underline break-all"
                          >
                            {formUrl}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">{reasonLabel(w.reason)}</td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-neutral-700">
                          {actionLabel(w.reason)}
                          {formUrl && formUrl !== "-" && (
                            <>
                              <br />
                              <a
                                href={formUrl}
                                target="_blank"
                                className="text-indigo-700 hover:underline"
                              >
                                フォームを開く
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">{st}</td>
                      <td className="px-3 py-2">
                        <div className="text-xs">
                          試行: {tries}
                          <br />
                          {err !== "-" ? (
                            <span className="text-red-600">{err}</span>
                          ) : (
                            <span className="text-neutral-500">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      待機中のデータはありません
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
      </DataTableCard>

      {msg && (
        <SurfaceCard>
          <pre className="whitespace-pre-wrap text-xs text-red-600">{msg}</pre>
        </SurfaceCard>
      )}
    </PageMain>
  );
}
