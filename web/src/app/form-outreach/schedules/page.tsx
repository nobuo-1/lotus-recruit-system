// web/src/app/form-outreach/schedules/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type RunRow = {
  id: string;
  flow: string | null; // "manual-send" / "auto-send" など想定
  status: string | null; // done / partial / failed など
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  tenant_id?: string | null;
};

const PAGE_SIZE = 10;

/** /api/me/tenant からテナントIDを取得 */
async function fetchTenantId(): Promise<string | null> {
  try {
    let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
    if (!meRes.ok) {
      meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
    }
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
    return iso.replace("T", " ").replace("Z", "");
  }
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
  });
}

function runType(flow: string | null | undefined) {
  const f = (flow || "").toLowerCase();
  if (f.includes("manual")) return "手動";
  if (f.includes("auto") || f.includes("schedule")) return "自動";
  return "-";
}

function statusLabel(status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  if (s === "done") return "完了";
  if (s === "partial") return "一部待機あり";
  if (s === "failed") return "失敗";
  return status || "-";
}

export default function SchedulesPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    (async () => setTenantId(await fetchTenantId()))();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      setMsg("");
      setLoading(true);
      try {
        const r = await fetch("/api/form-outreach/runs", {
          headers: { "x-tenant-id": tenantId },
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "runs fetch failed");
        setRows(j.rows ?? []);
        setPage(1);
      } catch (e: any) {
        setMsg(String(e?.message || e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-7xl p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              実行ログ
            </h1>
            <p className="text-sm text-neutral-500">
              実行履歴を一覧。定期実行の設定は「自動実行設定」から管理します。
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/form-outreach/automation"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              自動実行設定へ
            </Link>
            <Link
              href="/form-outreach/runs/manual"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              手動実行へ
            </Link>
            <Link
              href="/form-outreach/waitlist"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              待機リストへ
            </Link>
          </div>
        </div>

        <section className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">実行種別</th>
                  <th className="px-3 py-3 text-left">フロー</th>
                  <th className="px-3 py-3 text-left">状態</th>
                  <th className="px-3 py-3 text-left">開始（日本時間）</th>
                  <th className="px-3 py-3 text-left">終了（日本時間）</th>
                  <th className="px-3 py-3 text-left">エラー/メモ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{runType(r.flow)}</td>
                    <td className="px-3 py-2">{r.flow || "-"}</td>
                    <td className="px-3 py-2">{statusLabel(r.status)}</td>
                    <td className="px-3 py-2">{formatJst(r.started_at)}</td>
                    <td className="px-3 py-2">{formatJst(r.finished_at)}</td>
                    <td className="px-3 py-2">{r.error || "-"}</td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      直近のログがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ページング */}
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
