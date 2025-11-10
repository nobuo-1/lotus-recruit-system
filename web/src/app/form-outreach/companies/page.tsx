// web/src/app/form-outreach/companies/page.tsx
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

type Dataset = "prospects" | "rejected" | "similar";

type ProsRow = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  prefectures: string[] | null;
  job_site_source: string | null;
  created_at: string | null;
  updated_at: string | null;
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
  phone_number?: string | null;
  phone?: string | null;
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

function ellipsize(u?: string | null, max = 54) {
  const s = u || "";
  if (s.length <= max) return s;
  const head = Math.max(0, Math.floor((max - 1) * 0.65));
  const tail = Math.max(0, max - 1 - head);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

const PAGE_SIZE = 10;

type ColumnDef = {
  key: string;
  label: string;
  sortable: boolean;
  required: boolean;
};

const COLS: Record<Dataset, ColumnDef[]> = {
  prospects: [
    { key: "company_name", label: "社名", sortable: true, required: true },
    { key: "website", label: "サイトURL", sortable: true, required: false },
    { key: "contact_email", label: "メール", sortable: true, required: false },
    {
      key: "contact_form_url",
      label: "フォーム",
      sortable: true,
      required: false,
    },
    { key: "phone", label: "電話", sortable: true, required: false },
    { key: "company_size", label: "規模", sortable: true, required: false },
    { key: "prefectures", label: "都道府県", sortable: false, required: false },
    { key: "industry", label: "業種", sortable: true, required: false },
    { key: "capital", label: "資本金", sortable: true, required: false },
    { key: "established_on", label: "設立", sortable: true, required: false },
    {
      key: "corporate_number",
      label: "法人番号",
      sortable: true,
      required: false,
    },
    { key: "hq_address", label: "本店所在地", sortable: true, required: false },
    {
      key: "job_site_source",
      label: "取得元",
      sortable: true,
      required: false,
    },
    { key: "created_at", label: "取得日時", sortable: true, required: false },
  ],
  rejected: [
    { key: "company_name", label: "社名", sortable: true, required: true },
    { key: "website", label: "サイトURL", sortable: true, required: false },
    { key: "contact_email", label: "メール", sortable: true, required: false },
    { key: "phone", label: "電話", sortable: true, required: false },
    {
      key: "contact_form_url",
      label: "フォーム",
      sortable: true,
      required: false,
    },
    {
      key: "industry_large",
      label: "業種(大)",
      sortable: true,
      required: false,
    },
    {
      key: "industry_small",
      label: "業種(小)",
      sortable: true,
      required: false,
    },
    { key: "company_size", label: "推定規模", sortable: true, required: false },
    {
      key: "company_size_extracted",
      label: "抽出規模",
      sortable: true,
      required: false,
    },
    { key: "prefectures", label: "都道府県", sortable: false, required: false },
    { key: "capital", label: "資本金", sortable: true, required: false },
    { key: "established_on", label: "設立", sortable: true, required: false },
    { key: "source_site", label: "取得元", sortable: true, required: false },
    { key: "created_at", label: "取得日時", sortable: true, required: false },
  ],
  similar: [
    {
      key: "target_company_name",
      label: "社名(対象)",
      sortable: true,
      required: true,
    },
    {
      key: "found_company_name",
      label: "社名(検出)",
      sortable: true,
      required: false,
    },
    {
      key: "found_website",
      label: "検出サイトURL",
      sortable: true,
      required: false,
    },
    { key: "contact_email", label: "メール", sortable: true, required: false },
    {
      key: "contact_form_url",
      label: "フォーム",
      sortable: true,
      required: false,
    },
    { key: "phone", label: "電話", sortable: true, required: false },
    { key: "matched_addr", label: "住所一致", sortable: true, required: false },
    {
      key: "matched_company_ratio",
      label: "社名一致率",
      sortable: true,
      required: false,
    },
    { key: "source_site", label: "取得元", sortable: true, required: false },
    { key: "created_at", label: "取得日時", sortable: true, required: false },
  ],
};

export default function CompaniesPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset>("prospects");

  // filters
  const [q, setQ] = useState("");
  const [emailFilter, setEmailFilter] = useState<"" | "has" | "none">("");
  const [formFilter, setFormFilter] = useState<"" | "has" | "none">("");
  const [prefCsv, setPrefCsv] = useState("");
  const [industryQ, setIndustryQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [matchedAddr, setMatchedAddr] = useState<"" | "true" | "false">("");

  // sort
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // data
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const colList: ColumnDef[] = useMemo(() => COLS[dataset], [dataset]);

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const init: Record<string, boolean> = {};
    // 必須は常に表示、それ以外はデータセット別の現実的な初期値
    const prefer: Record<Dataset, string[]> = {
      prospects: [
        "website",
        "contact_email",
        "contact_form_url",
        "phone",
        "company_size",
        "prefectures",
        "industry",
        "capital",
        "established_on",
        "job_site_source",
        "created_at",
      ],
      rejected: [
        "website",
        "contact_email",
        "phone",
        "contact_form_url",
        "industry_large",
        "industry_small",
        "company_size",
        "company_size_extracted",
        "prefectures",
        "source_site",
        "created_at",
      ],
      similar: [
        "found_company_name",
        "found_website",
        "contact_email",
        "contact_form_url",
        "phone",
        "matched_addr",
        "matched_company_ratio",
        "source_site",
        "created_at",
      ],
    };
    const want = new Set(prefer[dataset]);
    for (const c of colList) {
      init[c.key] = c.required ? true : want.has(c.key);
    }
    setVisibleCols(init);
    setSortKey("created_at");
    setSortDir("desc");
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, colList]);

  useEffect(() => {
    (async () => {
      try {
        let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
        if (!meRes.ok)
          meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
        const me = await meRes.json().catch(() => ({}));
        const tId = me?.tenant_id ?? me?.profile?.tenant_id ?? null;
        setTenantId(tId);
      } catch {
        setTenantId(null);
      }
    })();
  }, []);

  const mapDatasetToTable = (d: Dataset) =>
    d === "prospects"
      ? "form_prospects"
      : d === "rejected"
      ? "form_prospects_rejected"
      : "form_similar_sites";

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMsg("");
    try {
      const qs = new URLSearchParams();
      // ★ 明示的に実テーブル名を送る（不備企業が空になる事象を防止）
      qs.set("table", mapDatasetToTable(dataset));
      qs.set("limit", String(PAGE_SIZE));
      qs.set("page", String(page));
      qs.set("sort", sortKey);
      qs.set("dir", sortDir);
      if (q.trim()) qs.set("q", q.trim());
      if (emailFilter) qs.set("email", emailFilter);
      if (formFilter) qs.set("form", formFilter);
      if (prefCsv.trim()) qs.set("prefectures", prefCsv.trim());
      if (industryQ.trim()) qs.set("industry", industryQ.trim());
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      if (dataset === "similar" && matchedAddr)
        qs.set("matched_addr", matchedAddr);

      const r = await fetch(`/api/form-outreach/companies?${qs.toString()}`, {
        headers: { "x-tenant-id": String(tenantId) },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
      setTotal(j.total ?? 0);
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
  }, [tenantId, dataset, page, sortKey, sortDir]);

  const applyFilters = () => {
    setPage(1);
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const headers: ColumnDef[] = useMemo(
    () => colList.filter((c: ColumnDef) => visibleCols[c.key] || c.required),
    [colList, visibleCols]
  );

  const toggleSort = (key: string, sortable: boolean) => {
    if (!sortable) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const formatVal = (k: string, v: any, row: AnyRow) => {
    if (k === "website" || k === "found_website" || k === "contact_form_url") {
      const url = String(v || "");
      if (!url) return "-";
      return (
        <a
          href={url}
          target="_blank"
          className="text-indigo-700 hover:underline break-all"
        >
          {ellipsize(url)}
        </a>
      );
    }
    if (k === "prefectures") {
      const arr = Array.isArray(v) ? v : [];
      return (
        <span className="text-neutral-800">
          {arr.length ? arr.join(" / ") : "-"}
        </span>
      );
    }
    if (k === "created_at" || k === "updated_at" || k === "established_on") {
      return v ? String(v).replace("T", " ").replace("Z", "") : "-";
    }
    if (k === "capital" && (v || v === 0)) {
      try {
        return new Intl.NumberFormat("ja-JP", {
          style: "currency",
          currency: "JPY",
          maximumFractionDigits: 0,
        }).format(Number(v));
      } catch {
        return `${v}円`;
      }
    }
    if (k === "matched_addr") {
      return v ? "一致" : "不一致";
    }
    if (
      k === "company_name" &&
      "found_company_name" in row &&
      (row as any).found_company_name
    ) {
      return (
        <div>
          <div>{String(v || "-")}</div>
          <div className="text-xs text-neutral-500">
            検出: {(row as any).found_company_name || "-"}
          </div>
        </div>
      );
    }
    return v ?? "-";
  };

  const tabLabel = (id: Dataset) =>
    id === "prospects"
      ? "正規企業リスト"
      : id === "rejected"
      ? "不備企業リスト"
      : "近似サイトリスト";

  const sortIcon = (key: string, sortable: boolean) => {
    if (!sortable) return null;
    if (sortKey !== key)
      return <ArrowUpDown className="h-3.5 w-3.5 text-neutral-400" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-neutral-800" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-neutral-800" />
    );
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-7xl p-6">
        {/* ヘッダ */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              企業一覧
            </h1>
            <p className="text-sm text-neutral-500">
              3テーブル切替 / フィルタ / 並び替え / 10件ごとのページネーション /
              カラム表示切替（社名は必須）
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/form-outreach/companies/fetch"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              title="手動で企業リストを取得"
            >
              企業リスト手動取得
            </Link>
          </div>
        </div>

        {/* タブ（表示名を変更） */}
        <div className="mb-3 inline-flex rounded-lg border border-neutral-200 overflow-hidden">
          {(["prospects", "rejected", "similar"] as Dataset[]).map((t) => (
            <button
              key={t}
              onClick={() => setDataset(t)}
              className={`px-3 py-2 text-sm border-r border-neutral-200 last:border-r-0 ${
                dataset === t
                  ? "bg-neutral-100 font-medium"
                  : "bg-white hover:bg-neutral-50"
              }`}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        {/* フィルタ */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                キーワード
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="社名 / URL / メール など"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                メール
              </label>
              <select
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value as any)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">すべて</option>
                <option value="has">あり</option>
                <option value="none">なし</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                フォーム
              </label>
              <select
                value={formFilter}
                onChange={(e) => setFormFilter(e.target.value as any)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">すべて</option>
                <option value="has">あり</option>
                <option value="none">なし</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                都道府県（カンマ区切）
              </label>
              <input
                value={prefCsv}
                onChange={(e) => setPrefCsv(e.target.value)}
                placeholder="大阪府,東京都"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>

            {/* 2段目 */}
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                業種（含む）
              </label>
              <input
                value={industryQ}
                onChange={(e) => setIndustryQ(e.target.value)}
                placeholder={
                  dataset === "rejected"
                    ? "大/小 いずれかに含む"
                    : "業種テキストに含む"
                }
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                disabled={dataset === "similar"}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                作成日（from）
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                作成日（to）
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            {dataset === "similar" && (
              <div>
                <label className="block text-xs text-neutral-500 mb-1">
                  住所一致
                </label>
                <select
                  value={matchedAddr}
                  onChange={(e) => setMatchedAddr(e.target.value as any)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="">すべて</option>
                  <option value="true">一致のみ</option>
                  <option value="false">不一致のみ</option>
                </select>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={applyFilters}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              フィルタを適用
            </button>
            <button
              onClick={() => {
                setQ("");
                setEmailFilter("");
                setFormFilter("");
                setPrefCsv("");
                setIndustryQ("");
                setDateFrom("");
                setDateTo("");
                setMatchedAddr("");
                setPage(1);
                load();
              }}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              リセット
            </button>
          </div>
        </section>

        {/* カラム表示切替 */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4 bg-white">
          <div className="text-sm font-medium mb-2">表示カラム</div>
          <div className="flex flex-wrap gap-3">
            {colList.map((c: ColumnDef) => {
              const checked = c.required ? true : !!visibleCols[c.key];
              return (
                <label
                  key={c.key}
                  className="inline-flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!!c.required}
                    onChange={(e) =>
                      setVisibleCols((prev) => ({
                        ...prev,
                        [c.key]: e.target.checked,
                      }))
                    }
                  />
                  <span className={c.required ? "font-medium" : ""}>
                    {c.label}
                    {c.required ? "（必須）" : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {/* テーブル */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  {headers.map((h: ColumnDef) => (
                    <th
                      key={h.key}
                      className="px-3 py-3 text-left whitespace-nowrap select-none"
                    >
                      <button
                        className={`inline-flex items-center gap-1 ${
                          h.sortable
                            ? "hover:underline"
                            : "opacity-60 cursor-default"
                        }`}
                        onClick={() => toggleSort(h.key, h.sortable)}
                        disabled={!h.sortable}
                        title={h.sortable ? "並び替え" : "並び不可"}
                      >
                        {h.label}
                        {sortIcon(h.key, h.sortable)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rows.map((r: AnyRow) => (
                  <tr key={(r as any).id}>
                    {headers.map((h: ColumnDef) => (
                      <td
                        key={h.key}
                        className={`px-3 py-2 align-top ${
                          h.key === "prefectures" ? "text-neutral-800" : ""
                        }`}
                      >
                        {formatVal(h.key, (r as any)[h.key], r)}
                      </td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={headers.length}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      対象がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
            <div className="text-xs text-neutral-500">
              全 {total} 件 / {page} /{" "}
              {Math.max(1, Math.ceil(total / PAGE_SIZE))} ページ（
              {PAGE_SIZE}件/ページ）
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
                onClick={() =>
                  setPage((p) =>
                    Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), p + 1)
                  )
                }
                disabled={
                  page >= Math.max(1, Math.ceil(total / PAGE_SIZE)) || loading
                }
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
