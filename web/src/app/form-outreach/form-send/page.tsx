"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Send, Search } from "lucide-react";
import {
  DataTableCard,
  PageHero,
  PageMain,
  StatChip,
  SurfaceCard,
} from "@/components/PageChrome";

type Dataset = "prospects" | "rejected" | "similar";
type Channel = "form" | "email";

type CompanyRow = {
  id: string;
  company_name?: string | null;
  target_company_name?: string | null;
  found_company_name?: string | null;
  website?: string | null;
  found_website?: string | null;
  contact_form_url?: string | null;
  contact_email?: string | null;
  email_sent?: boolean | null;
  form_sent?: boolean | null;
  industry?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  prefectures?: string[] | null;
  created_at?: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  subject: string | null;
};

type SendResult = {
  ok?: string[];
  queued?: string[];
  failed?: string[];
  debug?: Record<string, unknown>;
  error?: string;
};

type RunProgress = {
  channel: Channel;
  total: number;
  processed: number;
  ok: number;
  queued: number;
  failed: number;
  updated_at?: string;
};

type RunStatus = {
  run?: {
    id: string;
    flow: string | null;
    status: string | null;
    started_at: string | null;
    finished_at: string | null;
  };
  progress?: RunProgress | null;
  error?: string;
};

const PAGE_SIZE = 20;

function resolveTable(dataset: Dataset) {
  if (dataset === "rejected") return "form_prospects_rejected";
  if (dataset === "similar") return "form_similar_sites";
  return "form_prospects";
}

function datasetLabel(dataset: Dataset) {
  if (dataset === "rejected") return "不備企業リスト";
  if (dataset === "similar") return "近似サイトリスト";
  return "正規企業リスト";
}

function companyName(row: CompanyRow) {
  return (
    row.company_name ||
    row.target_company_name ||
    row.found_company_name ||
    "-"
  );
}

function website(row: CompanyRow) {
  return row.website || row.found_website || "";
}

function industry(row: CompanyRow) {
  return row.industry || [row.industry_large, row.industry_small].filter(Boolean).join(" / ");
}

async function fetchTenantId(): Promise<string | null> {
  try {
    let res = await fetch("/api/me/tenant", { cache: "no-store" });
    if (!res.ok) res = await fetch("/api/me/tenant/", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return data?.tenant_id ?? data?.profile?.tenant_id ?? null;
  } catch {
    return null;
  }
}

export default function FormSendPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset>("prospects");
  const [channel, setChannel] = useState<Channel>("form");
  const [q, setQ] = useState("");
  const [prefectures, setPrefectures] = useState("");
  const [industryQ, setIndustryQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SendResult | null>(null);
  const [activeRunId, setActiveRunId] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.id)),
    [rows, selected]
  );

  useEffect(() => {
    (async () => setTenantId(await fetchTenantId()))();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const saved = window.localStorage.getItem(`form-outreach-send-run:${tenantId}`);
    if (saved) setActiveRunId(saved);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const loadTemplates = async () => {
      const res = await fetch("/api/form-outreach/templates", {
        headers: { "x-tenant-id": tenantId },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      const nextRows = Array.isArray(json?.rows) ? json.rows : [];
      setTemplates(nextRows);
      setTemplateId((prev) => prev || nextRows[0]?.id || "");
    };
    loadTemplates().catch((e) => setMessage(String(e?.message || e)));
  }, [tenantId]);

  const loadRows = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessage("");
    try {
      const qs = new URLSearchParams();
      qs.set("table", dataset);
      qs.set("limit", String(PAGE_SIZE));
      qs.set("page", String(page));
      qs.set("sort", "created_at");
      qs.set("dir", "desc");
      if (channel === "form") {
        qs.set("form", "has");
        qs.set("exclude_waitlist", "true");
      }
      else qs.set("email", "has");
      if (q.trim()) qs.set("q", q.trim());
      if (prefectures.trim()) qs.set("prefectures", prefectures.trim());
      if (industryQ.trim() && dataset !== "similar") qs.set("industry", industryQ.trim());
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);

      const res = await fetch(`/api/form-outreach/companies?${qs.toString()}`, {
        headers: { "x-tenant-id": tenantId },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "companies fetch failed");
      setRows(Array.isArray(json?.rows) ? json.rows : []);
      setTotal(Number(json?.total ?? 0) || 0);
      setSelected(new Set());
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setMessage(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, dataset, page, channel]);

  const loadRunStatus = async (runId: string) => {
    if (!tenantId || !runId) return;
    const res = await fetch(
      `/api/form-outreach/manual/send/status?run_id=${encodeURIComponent(runId)}`,
      {
        headers: { "x-tenant-id": tenantId },
        cache: "no-store",
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "status fetch failed");
    setRunStatus(json);
    const status = json?.run?.status;
    if (status && status !== "running") {
      window.localStorage.removeItem(`form-outreach-send-run:${tenantId}`);
    }
  };

  useEffect(() => {
    if (!tenantId || !activeRunId) return;
    let active = true;
    const tick = async () => {
      try {
        await loadRunStatus(activeRunId);
      } catch (e: any) {
        if (active) setMessage(String(e?.message || e));
      }
    };
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeRunId]);

  const applyFilters = () => {
    setPage(1);
    loadRows();
  };

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((row) => row.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendSelected = async () => {
    if (!tenantId || !templateId || selected.size === 0 || sending) return;
    setSending(true);
    setMessage("");
    setResult(null);
    try {
      const res = await fetch("/api/form-outreach/manual/send/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          table: resolveTable(dataset),
          template_id: templateId,
          prospect_ids: Array.from(selected),
          mode: channel,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "send failed");
      const runId = String(json?.run_id || "");
      if (runId) {
        setActiveRunId(runId);
        window.localStorage.setItem(`form-outreach-send-run:${tenantId}`, runId);
        setMessage(`送信実行を開始しました（run_id: ${runId}）`);
      }
    } catch (e: any) {
      setMessage(String(e?.message || e));
    } finally {
      setSending(false);
    }
  };

  return (
    <PageMain className="space-y-6">
      <PageHero
        eyebrow="Form Submit"
        title="フォーム・メール一斉送信"
        description="企業を検索・フィルターし、手動で選択した対象へテンプレートと送信元設定を使って一斉送信します。自動送信できないフォームは待機リストへ仕分けます。"
        accent="rose"
        actions={[
          { href: "/form-outreach/templates", label: "テンプレート", variant: "secondary" },
          { href: "/form-outreach/senders", label: "送信元設定", variant: "secondary" },
          { href: "/form-outreach/waitlist", label: "待機リスト", variant: "secondary" },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <StatChip label="対象リスト" value={datasetLabel(dataset)} />
        <StatChip label="送信方法" value={channel === "form" ? "フォーム" : "メール"} />
        <StatChip label="検索結果" value={total} />
        <StatChip label="選択件数" value={selected.size} />
      </div>

      <SurfaceCard className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-neutral-500">送信方法</label>
            <select
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value as Channel);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="form">フォーム送信</option>
              <option value="email">メール送信</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">リスト</label>
            <select
              value={dataset}
              onChange={(e) => {
                setDataset(e.target.value as Dataset);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="prospects">正規企業リスト</option>
              <option value="rejected">不備企業リスト</option>
              <option value="similar">近似サイトリスト</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">テンプレート</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">キーワード</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="社名 / URL / メール"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">都道府県</label>
            <input
              value={prefectures}
              onChange={(e) => setPrefectures(e.target.value)}
              placeholder="東京都,大阪府"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">業種</label>
            <input
              value={industryQ}
              onChange={(e) => setIndustryQ(e.target.value)}
              disabled={dataset === "similar"}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">作成日 from</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">作成日 to</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              <Search className="h-4 w-4" />
              検索
            </button>
            <button
              onClick={sendSelected}
              disabled={selected.size === 0 || !templateId || sending}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-900 bg-neutral-950 px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? "開始中…" : "選択を一斉送信"}
            </button>
          </div>
        </div>
      </SurfaceCard>

      {activeRunId && runStatus?.progress && (
        <SurfaceCard className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-neutral-900">
                送信実行中の状況
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                run_id: {activeRunId} / 状態: {runStatus.run?.status || "-"}
              </div>
            </div>
            <button
              onClick={() => loadRunStatus(activeRunId)}
              className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              更新
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-2 rounded-full bg-neutral-950 transition-[width]"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    ((runStatus.progress.processed || 0) /
                      Math.max(1, runStatus.progress.total || 1)) *
                      100
                  )
                )}%`,
              }}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <StatChip
              label="完了"
              value={`${runStatus.progress.processed} / ${runStatus.progress.total}`}
            />
            <StatChip label="成功" value={runStatus.progress.ok} />
            <StatChip
              label="手動対応リスト"
              value={runStatus.progress.queued}
            />
            <StatChip label="失敗" value={runStatus.progress.failed} />
          </div>
        </SurfaceCard>
      )}

      <DataTableCard>
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </th>
                <th className="px-3 py-3 text-left">社名</th>
                <th className="px-3 py-3 text-left">フォーム</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">業種</th>
                <th className="px-3 py-3 text-left">都道府県</th>
                <th className="px-3 py-3 text-left">取得日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-neutral-900">
                    {companyName(row)}
                  </td>
                  <td className="px-3 py-2">
                    {row.contact_form_url ? (
                      <a
                        href={row.contact_form_url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-indigo-700 hover:underline"
                      >
                        あり
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.contact_email || "-"}
                  </td>
                  <td className="px-3 py-2">
                    {website(row) ? (
                      <a
                        href={website(row)}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-indigo-700 hover:underline"
                      >
                        {website(row)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">{industry(row) || "-"}</td>
                  <td className="px-3 py-2">
                    {Array.isArray(row.prefectures) && row.prefectures.length
                      ? row.prefectures.join(" / ")
                      : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {row.created_at?.replace("T", " ").replace("Z", "") || "-"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-neutral-400">
                    {loading ? "読み込み中…" : "対象がありません"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3">
          <div className="text-xs text-neutral-500">
            全 {total} 件 / {page} / {totalPages} ページ
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

      {selectedRows.length > 0 && (
        <SurfaceCard>
          <div className="text-sm font-medium text-neutral-900">
            送信予定: {selectedRows.map(companyName).join(" / ")}
          </div>
        </SurfaceCard>
      )}

      {message && (
        <SurfaceCard>
          <pre className="whitespace-pre-wrap text-xs text-neutral-700">{message}</pre>
        </SurfaceCard>
      )}

      {result?.debug && (
        <SurfaceCard>
          <div className="mb-2 text-sm font-medium text-neutral-900">
            フォーム適応ログ
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-neutral-600">
            {JSON.stringify(result.debug, null, 2)}
          </pre>
        </SurfaceCard>
      )}
    </PageMain>
  );
}
