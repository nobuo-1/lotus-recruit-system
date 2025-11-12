// web/src/app/form-outreach/waitlist/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type WaitRow = {
  id: string;
  tenant_id: string | null;
  table_name: string | null; // form_prospects / form_prospects_rejected / form_similar_sites
  prospect_id: string | null;
  reason: string | null; // queue_form / recaptcha / error など
  status?: string | null; // waiting / failed / done など（無ければ undefined）
  payload?: any | null; // JSONB
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

export default function WaitlistPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [rows, setRows] = useState<WaitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

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

      // 事前に用意してある想定のAPI（前回案）
      const r = await fetch(`/api/form-outreach/waitlist?${qs.toString()}`, {
        headers: { "x-tenant-id": tenantId },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
      setTotal(j.total ?? j.rows?.length ?? 0);
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
  }, [tenantId, page]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-7xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              待機リスト
            </h1>
            <p className="text-sm text-neutral-500">
              フォーム送信待ち・reCAPTCHA検知・エラー再試行待ちなどを表示します。
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/form-outreach/runs/manual"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              手動送信へ戻る
            </Link>
            <button
              onClick={() => load()}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              更新
            </button>
          </div>
        </div>

        <section className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">登録日時</th>
                  <th className="px-3 py-3 text-left">対象テーブル</th>
                  <th className="px-3 py-3 text-left">Prospect ID</th>
                  <th className="px-3 py-3 text-left">会社名</th>
                  <th className="px-3 py-3 text-left">フォームURL</th>
                  <th className="px-3 py-3 text-left">理由</th>
                  <th className="px-3 py-3 text-left">状態</th>
                  <th className="px-3 py-3 text-left">試行/エラー</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rows.map((w) => {
                  const created =
                    w.created_at?.replace("T", " ").replace("Z", "") || "-";
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
                      <td className="px-3 py-2">{w.reason || "-"}</td>
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
                      colSpan={8}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      待機中のデータはありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
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
    </>
  );
}
