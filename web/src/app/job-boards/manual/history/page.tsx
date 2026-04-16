"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

function getTenantIdFromCookie(): string | null {
  try {
    const m = document.cookie.match(
      /(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i
    );
    return m ? decodeURIComponent(m[2]) : null;
  } catch {
    return null;
  }
}

type HistoryActionType = "jobs" | "candidates";
type HistoryStatus = "success" | "partial" | "failed";

type HistoryParams = {
  action_type?: HistoryActionType;
  status?: HistoryStatus;
  sites?: string[];
  large?: string[];
  small?: string[];
  pref?: string[];
  total_jobs?: number;
  fetched_count?: number;
  success_count?: number;
  failure_count?: number;
  preview_count?: number;
  note?: string | null;
};

type Row = {
  id: string;
  created_at: string;
  tenant_id: string;
  params: HistoryParams | null;
  result_count: number;
  results?: unknown[] | null;
};

const SITE_LABEL_MAP: Record<string, string> = {
  mynavi: "マイナビ",
  doda: "doda",
  type: "type",
  womantype: "女の転職type",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === "string" && !!item);
}

function formatDateTime(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.replace("T", " ").replace("Z", "");
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function actionLabel(action?: string) {
  return action === "candidates" ? "求職者取得" : "求人件数取得";
}

function statusLabel(status?: string) {
  if (status === "success") return "成功";
  if (status === "partial") return "一部失敗";
  if (status === "failed") return "失敗";
  return "不明";
}

function statusClass(status?: string) {
  if (status === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "partial") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
}

function renderSites(params: HistoryParams | null) {
  const sites = toStringArray(params?.sites);
  if (sites.length === 0) return "-";
  return sites.map((site) => SITE_LABEL_MAP[site] ?? site).join(" / ");
}

function renderConditions(params: HistoryParams | null) {
  const large = toStringArray(params?.large);
  const small = toStringArray(params?.small);
  const pref = toStringArray(params?.pref);

  return (
    <div className="space-y-1 text-xs text-neutral-600">
      <div>大分類: {large.length ? large.join(", ") : "指定なし"}</div>
      <div>小分類: {small.length ? small.join(", ") : "指定なし"}</div>
      <div>都道府県: {pref.length ? pref.join(", ") : "全国"}</div>
    </div>
  );
}

function renderSummary(row: Row) {
  const params = row.params;
  if (params?.action_type === "candidates") {
    return (
      <div className="space-y-1 text-xs text-neutral-700">
        <div>取得求職者数: {params.fetched_count ?? row.result_count}</div>
        <div>
          成功 {params.success_count ?? 0} / 失敗 {params.failure_count ?? 0}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-xs text-neutral-700">
      <div>合計求人数: {params?.total_jobs ?? row.result_count}</div>
      <div>
        成功 {params?.success_count ?? 0} / 失敗 {params?.failure_count ?? 0}
      </div>
      <div>保存行数: {params?.preview_count ?? row.results?.length ?? 0}</div>
    </div>
  );
}

function buildDetailLines(row: Row): string[] {
  const params = row.params;
  const results = Array.isArray(row.results) ? row.results : [];

  if (results.length === 0) return [];

  return params?.action_type === "candidates"
    ? results.filter(isRecord).map((r) => {
        const site = typeof r.siteKey === "string" ? r.siteKey : "-";
        const total = typeof r.total === "number" ? `${r.total}名` : "取得失敗";
        const error =
          typeof r.errorMessage === "string" && r.errorMessage
            ? ` (${r.errorMessage})`
            : "";
        return `${SITE_LABEL_MAP[site] ?? site}: ${total}${error}`;
      })
    : results.filter(isRecord).map((r) => {
        const site = typeof r.site_key === "string" ? r.site_key : "-";
        const large =
          typeof r.internal_large === "string" && r.internal_large
            ? r.internal_large
            : "指定なし";
        const small =
          typeof r.internal_small === "string" && r.internal_small
            ? r.internal_small
            : "指定なし";
        const pref =
          typeof r.prefecture === "string" && r.prefecture ? r.prefecture : "全国";
        const total =
          typeof r.jobs_total === "number" ? `${r.jobs_total}件` : "取得失敗";
        const error =
          typeof r.error_reason === "string" && r.error_reason
            ? ` (${r.error_reason})`
            : "";
        return `${SITE_LABEL_MAP[site] ?? site} / ${large} / ${small} / ${pref}: ${total}${error}`;
      });
}

function DetailModal({
  row,
  onClose,
}: {
  row: Row;
  onClose: () => void;
}) {
  const params = row.params;
  const detailLines = buildDetailLines(row);
  const rawJson = JSON.stringify(row, null, 2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-neutral-900">
              手動実行履歴の詳細
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {formatDateTime(row.created_at)} / {actionLabel(params?.action_type)} /{" "}
              {statusLabel(params?.status)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            閉じる
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="mb-2 text-xs font-semibold text-neutral-700">
                実行条件
              </div>
              {renderConditions(params)}
              <div className="mt-3 text-xs text-neutral-600">
                対象サイト: {renderSites(params)}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="mb-2 text-xs font-semibold text-neutral-700">
                結果概要
              </div>
              {renderSummary(row)}
            </div>
          </div>

          {params?.note && (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
              <div className="mb-2 text-xs font-semibold text-neutral-700">
                メモ
              </div>
              <div className="whitespace-pre-wrap text-sm text-neutral-700">
                {params.note}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-neutral-700">
                保存結果の詳細
              </div>
              <div className="text-xs text-neutral-400">
                全 {detailLines.length} 件
              </div>
            </div>
            {detailLines.length > 0 ? (
              <div className="max-h-[48vh] overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50">
                <ul className="divide-y divide-neutral-200 text-sm text-neutral-700">
                  {detailLines.map((line, index) => (
                    <li key={`${row.id}-${index}`} className="px-3 py-2">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-neutral-400">保存結果はありません</div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-2 text-xs font-semibold text-neutral-700">
              保存データ
            </div>
            <pre className="max-h-[36vh] overflow-auto rounded-lg border border-neutral-200 bg-neutral-950 p-3 text-xs leading-6 text-neutral-100">
              {rawJson}
            </pre>
          </div>
        </div>

        <div className="border-t border-neutral-200 px-5 py-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManualHistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const tenant = getTenantIdFromCookie();
        const headers: Record<string, string> = {};
        if (tenant) headers["x-tenant-id"] = tenant;

        const r = await fetch("/api/job-boards/manual/history?limit=50", {
          cache: "no-store",
          headers,
        });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error || "fetch failed");
        setRows(Array.isArray(j.rows) ? (j.rows as Row[]) : []);
      } catch (e: unknown) {
        setMsg(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-7xl p-6 space-y-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-neutral-900">
            手動実行履歴
          </h1>
          <p className="text-sm text-neutral-500">
            求人件数取得と求職者取得の実行結果を、条件付きで保存しています。
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">日時</th>
                <th className="px-3 py-3 text-left">種別</th>
                <th className="px-3 py-3 text-left">状態</th>
                <th className="px-3 py-3 text-left">対象サイト</th>
                <th className="px-3 py-3 text-left">実行条件</th>
                <th className="px-3 py-3 text-left">結果概要</th>
                <th className="px-3 py-3 text-left">詳細</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-3 whitespace-nowrap text-neutral-700">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {actionLabel(row.params?.action_type)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(
                        row.params?.status
                      )}`}
                    >
                      {statusLabel(row.params?.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-neutral-700">
                    {renderSites(row.params)}
                  </td>
                  <td className="px-3 py-3">{renderConditions(row.params)}</td>
                  <td className="px-3 py-3">{renderSummary(row)}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedRow(row)}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
                    >
                      詳細を開く
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    履歴がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {msg && (
          <pre className="whitespace-pre-wrap text-xs text-red-600">{msg}</pre>
        )}
      </main>
      {selectedRow && (
        <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </>
  );
}
