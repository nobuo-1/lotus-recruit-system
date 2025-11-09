// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";

/** ===== LocalStorage Keys ===== */
const LS_KEY = "fo_manual_fetch_latest";
const LS_FETCH_COUNT = "fo_manual_fetch_count";
const LS_REJECT_KEY = "fo_manual_fetch_rejected";
const TWELVE_H_MS = 12 * 60 * 60 * 1000;

/** ===== Types ===== */
type StepState = "idle" | "running" | "done" | "error";

type AddedRow = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  contact_form_url?: string | null;
  phone?: string | null;
  industry?: string | null;
  company_size?: string | null;
  prefectures?: string[] | null;
  job_site_source?: "google" | "map" | null;
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
  created_at: string | null;
};

type RejectedRow = {
  company_name: string;
  website?: string | null;
  contact_email?: string | null;
  contact_form_url?: string | null;
  phone?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  company_size?: string | null;
  company_size_extracted?: string | null;
  prefectures?: string[] | null;
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
  source_site?: string | null;
  reject_reasons: string[];
  created_at?: string | null;
};

type Filters = {
  prefectures: string[];
  employee_size_ranges: string[];
  keywords: string[];
  industries_large: string[];
  industries_small: string[];
  capital_min?: number | null;
  capital_max?: number | null;
  established_from?: string | null;
  established_to?: string | null;
  updated_at?: string | null;
};

/** デバッグ表示用 */
type CrawlPreviewRow = {
  corporate_number: string;
  name: string;
  address?: string | null;
  detail_url?: string | null;
};
type CrawlDebug = {
  step?: {
    a2_crawled?: number;
    a3_picked?: number;
    a4_filled?: number;
    a5_inserted?: number;
  };
  new_cache?: number;
  to_insert_count?: number;
  using_service_role?: boolean;
  html_sig?: Record<string, any>;
  rows_preview?: CrawlPreviewRow[];
  trace?: string[];
  warning?: string;
  project_ref?: string | null;
  db_url_host?: string | null;
  db_probe_found?: number;
};

/** ===== Flow Titles ===== */
const FLOW_A_TITLES = [
  "1. 条件読み込み/表示",
  "2. 国税庁をクロール",
  "3. ランダム地域/企業抽出",
  "4. 詳細補完（名称/住所）",
  "5. キャッシュ保存",
];
const FLOW_B_TITLES = [
  "6. 新規キャッシュ分のHP推定",
  "7. 到達性チェック/会社概要抽出（AI可）",
  "8. form_prospects保存/反映 + 不適合保存",
  "9. 取得件数到達まで反復",
];

export default function ManualFetch() {
  /** ===== State ===== */
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const totalSteps = FLOW_A_TITLES.length + FLOW_B_TITLES.length;
  const [s, setS] = useState<StepState[]>(Array(totalSteps).fill("idle"));
  const [activeIdx, setActiveIdx] = useState<number>(-1);

  const [added, setAdded] = useState<AddedRow[]>([]);
  const [rejected, setRejected] = useState<RejectedRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // 「more」制御：常時10件、Moreで増やす
  const [visibleAdded, setVisibleAdded] = useState<number>(10);
  const [visibleRejected, setVisibleRejected] = useState<number>(10);

  const [filters, setFilters] = useState<Filters>({
    prefectures: [],
    employee_size_ranges: [],
    keywords: [],
    industries_large: [],
    industries_small: [],
    capital_min: null,
    capital_max: null,
    established_from: null,
    established_to: null,
    updated_at: null,
  });

  const [countModalOpen, setCountModalOpen] = useState<boolean>(false);
  const [fetchTotal, setFetchTotal] = useState<number>(60);

  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef<boolean>(false);

  /** Debug pane */
  const [crawlDebug, setCrawlDebug] = useState<CrawlDebug | null>(null);
  const [showDebug, setShowDebug] = useState<boolean>(true);

  /** rows_preview ページング */
  const ROWS_PER_PAGE = 10;
  const [rowsPage, setRowsPage] = useState<number>(1);

  const previewRows: CrawlPreviewRow[] = useMemo<CrawlPreviewRow[]>(
    () => (crawlDebug?.rows_preview ?? []) as CrawlPreviewRow[],
    [crawlDebug?.rows_preview]
  );
  const pageCount = Math.max(1, Math.ceil(previewRows.length / ROWS_PER_PAGE));
  const pagedPreview = useMemo<CrawlPreviewRow[]>(() => {
    const start = (rowsPage - 1) * ROWS_PER_PAGE;
    return previewRows.slice(start, start + ROWS_PER_PAGE);
  }, [previewRows, rowsPage]);

  useEffect(() => {
    setRowsPage(1);
  }, [previewRows.length]);

  /** ===== Effects: tenant & filters & restore local ===== */
  useEffect(() => {
    (async () => {
      try {
        // me/tenant
        let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
        if (!meRes.ok)
          meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
        const me = await meRes.json().catch(() => ({}));
        const tid: string | null =
          me?.tenant_id ?? me?.profile?.tenant_id ?? null;
        setTenantId(tid);

        // filters
        const fRes = await fetch("/api/form-outreach/settings/filters", {
          cache: "no-store",
          headers: tid ? { "x-tenant-id": String(tid) } : undefined,
        });
        const fj = await fRes.json().catch(() => ({}));
        const incoming = fj?.filters ?? {};
        setFilters({
          prefectures: Array.isArray(incoming.prefectures)
            ? incoming.prefectures
            : [],
          employee_size_ranges: Array.isArray(incoming.employee_size_ranges)
            ? incoming.employee_size_ranges
            : [],
          keywords: Array.isArray(incoming.keywords) ? incoming.keywords : [],
          industries_large: Array.isArray(incoming.industries_large)
            ? incoming.industries_large
            : [],
          industries_small: Array.isArray(incoming.industries_small)
            ? incoming.industries_small
            : Array.isArray(incoming.industries)
            ? incoming.industries
            : [],
          capital_min:
            typeof incoming.capital_min === "number"
              ? incoming.capital_min
              : null,
          capital_max:
            typeof incoming.capital_max === "number"
              ? incoming.capital_max
              : null,
          established_from:
            typeof incoming.established_from === "string"
              ? incoming.established_from
              : null,
          established_to:
            typeof incoming.established_to === "string"
              ? incoming.established_to
              : null,
          updated_at: incoming.updated_at ?? null,
        });

        // keep "added"（直近12時間のみ）
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const obj = JSON.parse(raw);
          const ts = obj?.ts ? new Date(obj.ts).getTime() : 0;
          if (Date.now() - ts < TWELVE_H_MS) {
            const now = Date.now();
            const rows = Array.isArray(obj.rows)
              ? (obj.rows as AddedRow[])
              : [];
            const filtered = rows.filter((r) => {
              const t = r?.created_at ? Date.parse(r.created_at) : ts;
              return Number.isFinite(t) && now - t <= TWELVE_H_MS;
            });
            setAdded(filtered);
            setVisibleAdded(10);
          } else {
            localStorage.removeItem(LS_KEY);
          }
        }

        // keep "rejected"（直近12時間のみ）
        const rejRaw = localStorage.getItem(LS_REJECT_KEY);
        if (rejRaw) {
          const obj = JSON.parse(rejRaw);
          const ts = obj?.ts ? new Date(obj.ts).getTime() : 0;
          if (Date.now() - ts < TWELVE_H_MS) {
            const now = Date.now();
            const rows: RejectedRow[] = Array.isArray(obj.rows)
              ? (obj.rows as RejectedRow[])
              : [];
            const filtered = rows.filter((r) => {
              const t = r?.created_at ? Date.parse(r.created_at!) : ts;
              return Number.isFinite(t) && now - t <= TWELVE_H_MS;
            });
            setRejected(filtered);
            setVisibleRejected(10);
          } else {
            localStorage.removeItem(LS_REJECT_KEY);
          }
        }

        // last fetch count
        const last = Number(localStorage.getItem(LS_FETCH_COUNT));
        if (Number.isFinite(last) && last > 0)
          setFetchTotal(Math.max(1, Math.min(2000, last)));
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyRunning = loading;

  /** ===== Actions ===== */
  const handleRunButton = () => {
    if (anyRunning) {
      cancelledRef.current = true;
      abortRef.current?.abort();
      setMsg("実行を中止しています…");
      return;
    }
    if (!tenantId) {
      setMsg("テナントが解決できませんでした。ログインを確認してください。");
      return;
    }
    setCountModalOpen(true);
  };

  const confirmAndRun = async () => {
    setCountModalOpen(false);
    localStorage.setItem(LS_FETCH_COUNT, String(fetchTotal));
    await runLoop(fetchTotal);
  };

  /** 実行ループ（★“DBの新規件数差分”で進捗を加算） */
  const runLoop = async (targetNew: number) => {
    if (!tenantId) return;
    setMsg("");
    setLoading(true);
    cancelledRef.current = false;
    setCrawlDebug(null);

    setS(Array(totalSteps).fill("idle"));
    setActiveIdx(-1);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      // A-1
      setActiveIdx(0);
      setS((a) => a.map((v, i) => (i === 0 ? "running" : "idle")));
      await delay(180);
      setS((a) => a.map((v, i) => (i === 0 ? "done" : v)));
      setActiveIdx(-1);

      let obtainedNew = 0; // form_prospects の “今回新規”
      let attempts = 0;
      const MAX_ATTEMPTS = Math.ceil(targetNew / 5) + 30;
      const BATCH = Math.min(
        25,
        Math.max(8, Math.floor(Math.max(10, targetNew) / 4))
      );
      const sinceAtStart = new Date().toISOString();

      // 直近の“DB件数”を基準に差分加算（← 5件で止まる問題を解決）
      let recentProspectsCount = 0;
      let recentSimilarCount = 0;

      while (obtainedNew < targetNew && attempts < MAX_ATTEMPTS) {
        if (cancelledRef.current) throw new Error("ABORTED");
        attempts++;
        const wantNow = Math.min(BATCH, Math.max(1, targetNew - obtainedNew));
        const seed = `${Date.now()}-${attempts}`;

        // A-2 ～ A-5（クロール＆キャッシュ）
        setActiveIdx(1);
        setS((a) => a.map((v, i) => (i === 1 ? "running" : v)));
        await nextFrame();

        const rCrawl = await fetch("/api/form-outreach/companies/crawl", {
          method: "POST",
          headers: {
            "x-tenant-id": tenantId,
            "content-type": "application/json",
          },
          body: JSON.stringify({ filters, want: wantNow, seed }),
          signal: abortRef.current.signal,
        });
        const j = await safeJson(rCrawl);

        const a2 = Number(j?.step?.a2_crawled || 0);
        const a3 = Number(j?.step?.a3_picked || 0);
        const a4 = Number(j?.step?.a4_filled || 0);
        const newCache = Math.max(0, Number(j?.new_cache || 0));
        const toInsert = Number(j?.to_insert_count || 0);
        const usingSrv = !!j?.using_service_role;

        setCrawlDebug({
          step: j?.step,
          new_cache: newCache,
          to_insert_count: toInsert,
          using_service_role: usingSrv,
          html_sig: j?.html_sig || {},
          rows_preview: Array.isArray(j?.rows_preview)
            ? (j.rows_preview as CrawlPreviewRow[])
            : [],
          trace: Array.isArray(j?.trace) ? (j.trace as string[]) : [],
          warning: j?.warning,
          project_ref: j?.project_ref ?? null,
          db_url_host: j?.db_url_host ?? null,
          db_probe_found: Number(j?.db_probe_found ?? 0),
        });

        setS((a) =>
          a.map((v, idx) => (idx === 1 ? (a2 > 0 ? "done" : "error") : v))
        );
        setActiveIdx(2);
        setS((a) =>
          a.map((v, idx) => (idx === 2 ? (a3 > 0 ? "done" : "error") : v))
        );
        setActiveIdx(3);
        setS((a) => a.map((v, idx) => (idx === 3 ? "done" : v)));
        setActiveIdx(4);
        setS((a) => a.map((v, idx) => (idx === 4 ? "done" : v)));

        if (!rCrawl.ok)
          throw new Error(j?.error || `crawl failed (${rCrawl.status})`);

        // ---- Phase B ----
        // 6. HP推定（表示のみ）
        setActiveIdx(5);
        setS((a) => a.map((v, idx) => (idx === 5 ? "running" : v)));
        await delay(80);
        setS((a) => a.map((v, idx) => (idx === 5 ? "done" : v)));

        // 7. 抽出（AI可）
        setActiveIdx(6);
        setS((a) => a.map((v, idx) => (idx === 6 ? "running" : v)));
        const enrichRes = await fetch("/api/form-outreach/companies/enrich", {
          method: "POST",
          headers: {
            "x-tenant-id": tenantId,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            since: sinceAtStart,
            want: Math.max(1, targetNew - obtainedNew),
            try_llm: true,
          }),
          signal: abortRef.current.signal,
        });
        const ej = await safeJson(enrichRes);
        setS((a) => a.map((v, idx) => (idx === 6 ? "done" : v)));

        // 8. 保存/反映 + 不適合保存
        const idxSave = FLOW_A_TITLES.length + 2;
        setActiveIdx(idxSave);
        setS((a) => a.map((v, idx) => (idx === idxSave ? "running" : v)));
        await delay(60);

        if (!enrichRes.ok) {
          setS((a) => a.map((v, idx) => (idx === idxSave ? "error" : v)));
          throw new Error(ej?.error || `enrich failed (${enrichRes.status})`);
        }

        // ★ 表示は DB の “recent_rows” を採用（form_prospects のみ表示）
        const recvRows: AddedRow[] = Array.isArray(ej?.recent_rows)
          ? (ej.recent_rows as AddedRow[])
          : [];
        if (recvRows.length) {
          setAdded(recvRows);
          localStorage.setItem(
            LS_KEY,
            JSON.stringify({ ts: new Date().toISOString(), rows: recvRows })
          );
          setVisibleAdded((v) => Math.max(10, v));
        }

        // 不適合は従来どおり保持
        const rejAll: RejectedRow[] = Array.isArray(ej?.rejected)
          ? (ej.rejected as RejectedRow[])
          : [];
        if (rejAll.length) {
          setRejected((prev) => {
            const next = dedupeRejected([...rejAll, ...prev]);
            localStorage.setItem(
              LS_REJECT_KEY,
              JSON.stringify({ ts: new Date().toISOString(), rows: next })
            );
            setVisibleRejected((v) => Math.max(10, v));
            return next;
          });
        }

        // ✅ 進捗は “recent_count” の差分で加算（5件で止まる問題を修正）
        const newRecentProspectsCount = Number(ej?.recent_count || 0);
        const delta = Math.max(
          0,
          newRecentProspectsCount - recentProspectsCount
        );
        recentProspectsCount = newRecentProspectsCount;
        obtainedNew += delta;

        // 近似サイトの新規件数も DB 値で表示用に取得
        const newRecentSimilarCount = Number(ej?.recent_similar_count || 0);
        recentSimilarCount = newRecentSimilarCount;

        setS((a) => a.map((v, idx) => (idx === idxSave ? "done" : v)));

        // 9. 反復（進行表示）
        const idxLoop = FLOW_A_TITLES.length + FLOW_B_TITLES.length - 1;
        setActiveIdx(idxLoop);
        setS((a) => a.map((v, idx) => (idx === idxLoop ? "running" : v)));
        setMsg(
          [
            `新規追加 進行：${obtainedNew}/${targetNew} 件 (+${delta})`,
            `近似サイト（新規）：${recentSimilarCount} 件`,
            `NTA: raw=${a2}, pick=${a3}, fill=${a4}, ins(cache)=${newCache}, to_insert(cache)=${toInsert}`,
            `権限: ${usingSrv ? "service-role" : "anon"}${
              j?.warning ? " / 警告あり" : ""
            }`,
          ].join("\n")
        );
        await delay(40);
        setS((a) => a.map((v, idx) => (idx === idxLoop ? "done" : v)));
        setActiveIdx(-1);

        // 取得が停滞している場合は少し待つ
        if (delta === 0 && newCache === 0) await delay(300);
      }

      setMsg(
        `完了：新規追加が目標件数に達しました（${Math.max(
          0,
          obtainedNew
        )}/${targetNew} 件）`
      );
    } catch (e: any) {
      setActiveIdx(-1);
      setS((arr) => arr.map((v) => (v === "running" ? "error" : v)));
      if (String(e?.message || e) === "ABORTED") setMsg("実行を中止しました。");
      else setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const cancelAdditions = async () => {
    if (!tenantId || added.length === 0) return;
    if (!confirm("今回追加分をすべて取り消して削除します。よろしいですか？"))
      return;
    try {
      const ids = added.map((r: AddedRow) => r.id);
      const r = await fetch("/api/form-outreach/companies/cancel-additions", {
        method: "POST",
        headers: {
          "x-tenant-id": tenantId,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "cancel failed");
      setMsg(`取消しました：削除 ${j.deleted ?? 0} 件`);
      setAdded([]);
      localStorage.removeItem(LS_KEY);
      setVisibleAdded(10);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const addFromRejected = async (row: RejectedRow) => {
    try {
      if (!tenantId) throw new Error("tenant missing");
      const r = await fetch("/api/form-outreach/companies/fetch", {
        method: "PATCH",
        headers: {
          "x-tenant-id": tenantId,
          "content-type": "application/json",
        },
        body: JSON.stringify({ candidate: row }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "manual add failed");

      if (j?.row) {
        setAdded((prev) => {
          const next = [j.row as AddedRow, ...prev];
          localStorage.setItem(
            LS_KEY,
            JSON.stringify({ ts: new Date().toISOString(), rows: next })
          );
          setVisibleAdded((v) => Math.max(10, v));
          return next;
        });
      }
      setRejected((prev) => {
        const next = prev.filter((x) => !sameRejected(x, row));
        localStorage.setItem(
          LS_REJECT_KEY,
          JSON.stringify({ ts: new Date().toISOString(), rows: next })
        );
        setVisibleRejected((v) => Math.max(10, v));
        return next;
      });
      setMsg("不適合から採用に追加しました。");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const hideRejected = (row: RejectedRow) => {
    setRejected((prev) => {
      const next = prev.filter((x) => !sameRejected(x, row));
      localStorage.setItem(
        LS_REJECT_KEY,
        JSON.stringify({ ts: new Date().toISOString(), rows: next })
      );
      setVisibleRejected((v) => Math.max(10, v));
      return next;
    });
  };

  const summaryParts = useMemo(() => {
    const pref = filters.prefectures.length
      ? filters.prefectures.join(" / ")
      : "全国";
    const size = filters.employee_size_ranges.length
      ? filters.employee_size_ranges.join(" / ")
      : "指定なし";
    const kw = filters.keywords.length
      ? filters.keywords.join(" / ")
      : "指定なし";
    const ind =
      filters.industries_small.length > 0
        ? filters.industries_small.slice(0, 6).join(" / ") +
          (filters.industries_small.length > 6 ? " …" : "")
        : filters.industries_large.length > 0
        ? filters.industries_large.join(" / ")
        : "指定なし";
    const cap =
      (filters.capital_min != null
        ? `≥${formatJPY(filters.capital_min)}`
        : "指定なし") +
      " 〜 " +
      (filters.capital_max != null
        ? `≤${formatJPY(filters.capital_max)}`
        : "指定なし");
    const est =
      (filters.established_from || "指定なし") +
      " 〜 " +
      (filters.established_to || "指定なし");
    return { pref, size, kw, ind, cap, est };
  }, [filters]);

  /** ===== Render ===== */
  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        {/* Header & Actions */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-neutral-900">
              企業リスト手動取得
            </h1>
            <p className="text-sm text-neutral-500">
              二段フローで保存を逐次反映。アイコンの動きは実処理に同期します。
            </p>
            {/* 🔧 修正1: テナント詳細表示を削除（他の説明は維持） */}
            <p className="text-xs text-neutral-500 mt-1 break-words">
              現在のフィルタ:{" "}
              <span className="opacity-80">都道府県={summaryParts.pref}</span>
              <br />
              <span className="opacity-80">規模={summaryParts.size}</span>
              <br />
              <span className="opacity-80">資本金={summaryParts.cap}</span>
              <br />
              <span className="opacity-80">設立={summaryParts.est}</span>
              <br />
              <span className="opacity-80">KW={summaryParts.kw}</span>
              <br />
              <span className="opacity-80">業種={summaryParts.ind}</span>
            </p>
          </div>
          <div className="shrink-0 whitespace-nowrap flex gap-2">
            <Link
              href="/form-outreach/companies"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              企業一覧へ
            </Link>
            <button
              onClick={handleRunButton}
              className={`inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 ${
                anyRunning ? "text-red-700 border-red-300" : ""
              }`}
            >
              {anyRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  中止する
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  ワークフローを実行
                </>
              )}
            </button>
          </div>
        </div>

        {/* Phase A */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-800">
              Phase A: NTAクロール → キャッシュ保存
            </div>
            <Link
              href="/form-outreach/settings/filters"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
            >
              取得フィルタ設定へ
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {FLOW_A_TITLES.map((title, idx) => (
              <FlowNode
                key={title}
                title={title}
                state={s[idx]}
                active={activeIdx === idx}
              />
            ))}
          </div>
        </section>

        {/* Phase B */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="mb-3 text-sm font-medium text-neutral-800">
            Phase B: HP解決 → 会社概要抽出（AI） → form_prospects保存 +
            不適合保存 → 取得件数到達まで反復
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {FLOW_B_TITLES.map((title, bIdx) => {
              const idx = FLOW_A_TITLES.length + bIdx;
              return (
                <FlowNode
                  key={title}
                  title={title}
                  state={s[idx]}
                  active={activeIdx === idx}
                />
              );
            })}
          </div>
        </section>

        {/* Debug Section */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-800">
              デバッグ（API応答の詳細）
            </div>
            <button
              onClick={() => setShowDebug((v) => !v)}
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
            >
              {showDebug ? "閉じる" : "開く"}
            </button>
          </div>

          {showDebug && (
            <div className="space-y-3">
              <div className="text-xs text-neutral-700">
                {crawlDebug ? (
                  <>
                    {crawlDebug.warning && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 mb-2">
                        ⚠ {crawlDebug.warning}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div className="rounded border border-neutral-200 p-2">
                        <div className="font-semibold mb-1">Step</div>
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(crawlDebug.step || {}, null, 2)}
                        </pre>
                      </div>
                      <div className="rounded border border-neutral-200 p-2">
                        <div className="font-semibold mb-1">Meta</div>
                        <pre className="whitespace-pre-wrap">{`new_cache: ${
                          crawlDebug.new_cache ?? 0
                        }
to_insert: ${crawlDebug.to_insert_count ?? 0}
using_service_role: ${crawlDebug.using_service_role ? "true" : "false"}`}</pre>
                      </div>
                      <div className="rounded border border-neutral-200 p-2">
                        <div className="font-semibold mb-1">Probe</div>
                        <pre className="whitespace-pre-wrap">{`project_ref: ${
                          crawlDebug.project_ref ?? "-"
                        }
db_url_host: ${crawlDebug.db_url_host ?? "-"}
db_probe_found: ${crawlDebug.db_probe_found ?? 0}`}</pre>
                      </div>
                      <div className="rounded border border-neutral-200 p-2">
                        <div className="font-semibold mb-1">html_sig</div>
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(crawlDebug.html_sig || {}, null, 2)}
                        </pre>
                      </div>
                    </div>

                    {/* rows_preview ページング対応 */}
                    <div className="rounded border border-neutral-200">
                      <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50 font-semibold flex items-center justify-between">
                        <span>rows_preview（プレビュー）</span>
                        <span className="text-xs text-neutral-500">
                          {previewRows.length} 件 / {pageCount} ページ
                        </span>
                      </div>

                      <div className="flex items-center gap-1 px-3 py-2">
                        <PagerButton
                          onClick={() => setRowsPage(1)}
                          disabled={rowsPage === 1}
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </PagerButton>
                        <PagerButton
                          onClick={() => setRowsPage((p) => Math.max(1, p - 1))}
                          disabled={rowsPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </PagerButton>
                        <span className="mx-2 text-xs text-neutral-600">
                          {rowsPage} / {pageCount}
                        </span>
                        <PagerButton
                          onClick={() =>
                            setRowsPage((p) => Math.min(pageCount, p + 1))
                          }
                          disabled={rowsPage === pageCount}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </PagerButton>
                        <PagerButton
                          onClick={() => setRowsPage(pageCount)}
                          disabled={rowsPage === pageCount}
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </PagerButton>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-[900px] w-full text-xs">
                          <thead className="bg-neutral-50 text-neutral-600">
                            <tr>
                              <th className="px-2 py-2 text-left whitespace-nowrap">
                                法人番号
                              </th>
                              <th className="px-2 py-2 text-left whitespace-nowrap">
                                商号又は名称
                              </th>
                              <th className="px-2 py-2 text-left whitespace-nowrap">
                                所在地
                              </th>
                              <th className="px-2 py-2 text-left whitespace-nowrap">
                                履歴等
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-200">
                            {pagedPreview.map((r: CrawlPreviewRow) => (
                              <tr key={r.corporate_number}>
                                <td className="px-2 py-1 font-mono">
                                  {r.corporate_number}
                                </td>
                                <td className="px-2 py-1">{r.name}</td>
                                <td className="px-2 py-1">
                                  {r.address || "-"}
                                </td>
                                <td className="px-2 py-1">
                                  {r.detail_url ? (
                                    <a
                                      href={r.detail_url}
                                      target="_blank"
                                      className="text-indigo-700 hover:underline"
                                    >
                                      履歴等
                                    </a>
                                  ) : (
                                    "-"
                                  )}
                                </td>
                              </tr>
                            ))}
                            {pagedPreview.length === 0 && (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="px-3 py-6 text-center text-neutral-400"
                                >
                                  取得プレビューはありません
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded border border-neutral-200 p-2 mt-2">
                      <div className="font-semibold mb-1">trace</div>
                      <pre className="whitespace-pre-wrap">
                        {(crawlDebug.trace || []).join("\n")}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="text-neutral-400">
                    まだデバッグ情報はありません（実行すると表示されます）。
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 今回追加テーブル（form_prospects のみ） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              今回追加（直近12時間・新しい順）
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-600">
              {/* 近似サイトの新規件数は上部メッセージでも表示。ここでは表は prospected のみ */}
              <button
                onClick={cancelAdditions}
                disabled={added.length === 0}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50"
              >
                取り消して削除
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1300px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  {[
                    "企業名",
                    "業種",
                    "サイトURL",
                    "メール",
                    "電話",
                    "フォーム",
                    "規模",
                    "都道府県",
                    "資本金",
                    "設立",
                    "法人番号",
                    "本社所在地",
                    "取得元",
                    "取得日時",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left whitespace-nowrap"
                      style={{ writingMode: "horizontal-tb" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {added.slice(0, visibleAdded).map((c: AddedRow) => (
                  <tr key={c.id}>
                    {/* 🔧 修正5: 企業名と業種のカラム幅を広げ、15〜18文字程度で改行 */}
                    <td className="px-3 py-2 whitespace-normal break-words min-w-[16ch] max-w-[24ch]">
                      {c.company_name || "-"}
                    </td>
                    <td className="px-3 py-2 whitespace-normal break-words min-w-[16ch] max-w-[24ch]">
                      {c.industry || "-"}
                    </td>

                    <td className="px-3 py-2">
                      {c.website ? (
                        <a
                          href={c.website}
                          target="_blank"
                          className="text-indigo-700 hover:underline break-all"
                        >
                          {c.website}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2">{c.contact_email || "-"}</td>
                    <td className="px-3 py-2">{c.phone || "-"}</td>
                    <td className="px-3 py-2">
                      {c.contact_form_url ? (
                        <a
                          href={c.contact_form_url}
                          target="_blank"
                          className="text-indigo-700 hover:underline"
                        >
                          あり
                        </a>
                      ) : (
                        "なし"
                      )}
                    </td>
                    <td className="px-3 py-2">{c.company_size || "-"}</td>
                    <td className="px-3 py-2">
                      {Array.isArray(c.prefectures) && c.prefectures.length
                        ? c.prefectures.join(" / ")
                        : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {c.capital != null ? formatJPY(Number(c.capital)) : "-"}
                    </td>
                    <td className="px-3 py-2">{c.established_on || "-"}</td>
                    <td className="px-3 py-2">{c.corporate_number || "-"}</td>
                    <td className="px-3 py-2 break-all">
                      {c.hq_address || "-"}
                    </td>
                    <td className="px-3 py-2">{c.job_site_source || "-"}</td>
                    <td className="px-3 py-2">
                      {c.created_at
                        ? c.created_at.replace("T", " ").replace("Z", "")
                        : "-"}
                    </td>
                  </tr>
                ))}
                {added.length === 0 && (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      新規追加はありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {added.length > visibleAdded && (
              <div className="p-3 text-center">
                <button
                  className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
                  onClick={() => setVisibleAdded((v) => v + 20)}
                >
                  more（さらに表示）
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 不適合一覧（維持） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden mt-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              フィルタ不適合（直近12時間・重複除去済み / 直近取得が上）
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              表示件数: {Math.min(visibleRejected, rejected.length)} /{" "}
              {rejected.length}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1500px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  {[
                    "企業名",
                    "サイトURL",
                    "都道府県",
                    "資本金",
                    "設立",
                    "法人番号",
                    "本社所在地",
                    "メール",
                    "電話",
                    "フォーム",
                    "推定規模",
                    "業種",
                    "不採用理由",
                    "操作",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left whitespace-nowrap"
                      style={{ writingMode: "horizontal-tb" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rejected
                  .slice(0, visibleRejected)
                  .map((r: RejectedRow, idx: number) => (
                    <tr key={`${r.corporate_number ?? ""}-${idx}`}>
                      <td className="px-3 py-2">{r.company_name}</td>
                      <td className="px-3 py-2">
                        {r.website ? (
                          <a
                            href={r.website}
                            target="_blank"
                            className="text-indigo-700 hover:underline break-all"
                          >
                            {r.website}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {Array.isArray(r.prefectures) && r.prefectures?.length
                          ? r.prefectures.join(" / ")
                          : "-"}
                      </td>
                      <td className="px-3 py-2">
                        {r.capital != null ? formatJPY(Number(r.capital)) : "-"}
                      </td>
                      <td className="px-3 py-2">{r.established_on || "-"}</td>
                      <td className="px-3 py-2">{r.corporate_number || "-"}</td>
                      <td className="px-3 py-2 break-all">
                        {r.hq_address || "-"}
                      </td>
                      <td className="px-3 py-2">{r.contact_email || "-"}</td>
                      <td className="px-3 py-2">{r.phone || "-"}</td>
                      <td className="px-3 py-2">
                        {r.contact_form_url ? (
                          <a
                            href={r.contact_form_url}
                            target="_blank"
                            className="text-indigo-700 hover:underline"
                          >
                            あり
                          </a>
                        ) : (
                          "なし"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.company_size_extracted || r.company_size || "-"}
                      </td>
                      <td className="px-3 py-2">
                        {[r.industry_large, r.industry_small]
                          .filter(Boolean)
                          .join(" / ") || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <ul className="list-disc list-inside space-y-0.5">
                          {Array.from(new Set(r.reject_reasons || [])).map(
                            (rr: string, i: number) => (
                              <li key={i} className="text-xs text-neutral-700">
                                {rr}
                              </li>
                            )
                          )}
                        </ul>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => addFromRejected(r)}
                            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                          >
                            採用に追加
                          </button>
                          <button
                            onClick={() => hideRejected(r)}
                            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                            title="この行を非表示にします"
                          >
                            非表示
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {rejected.length === 0 && (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      不適合データはありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {rejected.length > visibleRejected && (
              <div className="p-3 text-center">
                <button
                  className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
                  onClick={() => setVisibleRejected((v) => v + 20)}
                >
                  more（さらに表示）
                </button>
              </div>
            )}
          </div>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600">
            {msg}
          </pre>
        )}
      </main>

      {countModalOpen && (
        <CountModal
          defaultValue={fetchTotal}
          onCloseAction={() => setCountModalOpen(false)}
          onApplyAction={(n: number) => {
            setFetchTotal(n);
            confirmAndRun();
          }}
        />
      )}
    </>
  );
}

/** ===== UI Parts ===== */

function FlowNode({
  title,
  state,
  active,
}: {
  title: string;
  state: StepState;
  active: boolean;
}) {
  const icon =
    state === "running" ? (
      <Loader2
        className={`h-6 w-6 ${active ? "animate-spin" : ""} text-neutral-700`}
      />
    ) : state === "done" ? (
      <CheckCircle className="h-6 w-6 text-emerald-600" />
    ) : state === "error" ? (
      <XCircle className="h-6 w-6 text-red-600" />
    ) : (
      <Play className="h-6 w-6 text-neutral-400" />
    );

  return (
    <div className="relative rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        {icon}
        <div className="text-sm font-medium text-neutral-800">{title}</div>
      </div>
    </div>
  );
}

function CountModal({
  defaultValue,
  onCloseAction,
  onApplyAction,
}: {
  defaultValue: number;
  onCloseAction: () => void;
  onApplyAction: (n: number) => void;
}) {
  const [n, setN] = useState<number>(defaultValue ?? 60);
  const clampVal = (v: number) => Math.max(1, Math.min(2000, Math.floor(v)));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[520px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="font-semibold">取得件数の指定</div>
          <button
            onClick={onCloseAction}
            className="rounded-lg px-2 py-1 border border-neutral-300 hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-neutral-700">
            今回<strong>新規追加</strong>
            する目標件数を指定してください（1〜2000件）。
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={2000}
              step={1}
              value={n}
              onChange={(e) => setN(clampVal(Number(e.target.value)))}
              className="w-full"
            />
            <input
              type="number"
              min={1}
              max={2000}
              step={1}
              value={n}
              onChange={(e) => setN(clampVal(Number(e.target.value)))}
              className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <p className="text-[11px] text-neutral-500">
            ※ 取得件数は実際に「サイト到達 → 抽出 → 保存」で
            <strong>新規作成</strong>できた件数でカウントします。
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200">
          <button
            onClick={() => setN(60)}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            デフォルトに戻す（60件）
          </button>
          <button
            onClick={() => onApplyAction(n)}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            開始する
          </button>
        </div>
      </div>
    </div>
  );
}

function PagerButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2 py-1 text-xs ${
        disabled
          ? "border-neutral-200 text-neutral-300"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}

/** ===== Helpers ===== */
function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
async function nextFrame() {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}
async function safeJson(res: Response) {
  try {
    const t = await res.text();
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}
function normalizeSite(u?: string | null) {
  if (!u) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    url.hash = "";
    return url.toString().toLowerCase();
  } catch {
    return (u || "").toLowerCase();
  }
}
function rejectedKey(c: RejectedRow) {
  const k1 = (c.corporate_number || "").trim();
  const k2 = normalizeSite(c.website);
  const k3 = (c.company_name || "").trim().toLowerCase();
  return `${k1}__${k2}__${k3}`;
}
function sameRejected(a: RejectedRow, b: RejectedRow) {
  return rejectedKey(a) === rejectedKey(b);
}
function dedupeRejected(list: RejectedRow[]): RejectedRow[] {
  const map = new Map<string, RejectedRow>();
  for (const r of list) {
    const key = rejectedKey(r);
    const existed = map.get(key);
    if (!existed) map.set(key, r);
    else {
      const mergedReasons = Array.from(
        new Set([
          ...(existed.reject_reasons || []),
          ...(r.reject_reasons || []),
        ])
      );
      map.set(key, { ...existed, reject_reasons: mergedReasons });
    }
  }
  return Array.from(map.values());
}
function formatJPY(n: number) {
  try {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n}円`;
  }
}
