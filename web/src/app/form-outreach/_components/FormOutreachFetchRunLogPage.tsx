"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DataTableCard,
  PageHero,
  PageMain,
  StatChip,
  SurfaceCard,
} from "@/components/PageChrome";

type RunRow = {
  id: string;
  tenant_id?: string | null;
  source: "manual" | "auto";
  flow: string | null;
  status: string | null;
  error: string | null;
  note?: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at?: string | null;
  requested_count?: number | null;
  progress_count?: number | null;
  inserted_count?: number | null;
  new_prospects?: number | null;
  new_rejected?: number | null;
  new_similar_sites?: number | null;
};

type Props = {
  title?: string;
  description?: string;
  pageSize?: number;
};

async function fetchTenantId(): Promise<string | null> {
  try {
    let res = await fetch("/api/me/tenant", { cache: "no-store" });
    if (!res.ok) {
      res = await fetch("/api/me/tenant/", { cache: "no-store" });
    }
    const data = await res.json().catch(() => ({}));
    return data?.tenant_id ?? data?.profile?.tenant_id ?? null;
  } catch {
    return null;
  }
}

function formatJst(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ").replace("Z", "");
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
  });
}

function sourceLabel(source: RunRow["source"]) {
  return source === "auto" ? "自動フォーム情報取得" : "手動フォーム情報取得";
}

function statusLabel(status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  if (s === "queued") return "待機中";
  if (s === "running") return "実行中";
  if (s === "done" || s === "completed" || s === "success") return "完了";
  if (s === "partial") return "一部完了";
  if (s === "failed" || s === "error") return "失敗";
  if (s === "skipped") return "スキップ";
  if (s === "canceled") return "キャンセル";
  return status || "-";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resultText(row: RunRow) {
  if (row.source === "auto") {
    const prospects = Number(row.new_prospects ?? 0);
    const rejected = Number(row.new_rejected ?? 0);
    const similar = Number(row.new_similar_sites ?? 0);
    const target = row.requested_count ?? null;
    return `正規 ${prospects} / 不備 ${rejected} / 近似 ${similar}${
      target != null ? ` / 目標 ${target}` : ""
    }`;
  }

  const inserted = row.inserted_count ?? 0;
  const progress = row.progress_count ?? inserted;
  const requested = row.requested_count ?? null;
  return requested != null
    ? `保存 ${inserted} / 進捗 ${progress} / 目標 ${requested}`
    : `保存 ${inserted}`;
}

export default function FormOutreachFetchRunLogPage({
  title = "フォーム情報取得ログ",
  description = "企業リストの手動取得と自動取得の実行ログを同じ表で確認できます。",
  pageSize = 20,
}: Props) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => setTenantId(await fetchTenantId()))();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      setLoading(true);
      setMessage("");
      try {
        const res = await fetch("/api/form-outreach/runs", {
          headers: { "x-tenant-id": tenantId },
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "runs fetch failed");
        setRows(Array.isArray(json?.rows) ? json.rows : []);
        setPage(1);
      } catch (e: unknown) {
        setRows([]);
        setMessage(errorMessage(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const latestAt = rows[0]?.started_at || rows[0]?.created_at || null;
  const runningCount = useMemo(
    () => rows.filter((row) => row.status === "running").length,
    [rows]
  );

  return (
    <PageMain className="space-y-6">
      <PageHero
        eyebrow="Fetch Logs"
        title={title}
        description={description}
        accent="rose"
        actions={[
          {
            href: "/form-outreach/automation",
            label: "自動実行設定",
            variant: "secondary",
          },
          {
            href: "/form-outreach/companies/fetch",
            label: "企業リスト手動取得",
            variant: "secondary",
          },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <StatChip label="ログ件数" value={rows.length} />
        <StatChip label="実行中" value={runningCount} />
        <StatChip label="最新実行" value={formatJst(latestAt)} />
        <StatChip label="ページ" value={`${page} / ${totalPages}`} />
      </div>

      <DataTableCard>
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">実行種別</th>
                <th className="px-3 py-3 text-left">状態</th>
                <th className="px-3 py-3 text-left">取得結果</th>
                <th className="px-3 py-3 text-left">開始</th>
                <th className="px-3 py-3 text-left">終了</th>
                <th className="px-3 py-3 text-left">メモ/エラー</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {pageRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-900">
                      {sourceLabel(row.source)}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {row.flow || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2">{statusLabel(row.status)}</td>
                  <td className="px-3 py-2">{resultText(row)}</td>
                  <td className="px-3 py-2">{formatJst(row.started_at)}</td>
                  <td className="px-3 py-2">{formatJst(row.finished_at)}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {row.error || row.note || "-"}
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    {loading ? "読み込み中…" : "取得ログがありません"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3">
          <div className="text-xs text-neutral-500">
            全 {rows.length} 件 / {pageSize} 件ずつ表示
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

      {message && (
        <SurfaceCard>
          <pre className="whitespace-pre-wrap text-xs text-red-600">
            {message}
          </pre>
        </SurfaceCard>
      )}
    </PageMain>
  );
}
