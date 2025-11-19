// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, Play } from "lucide-react";

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
  "7. 会社概要抽出（AI可）",
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

  // 修正2: 「開始する」押下時刻（この時刻以降のものだけ表示＆カウント）
  const [startedAtIso, setStartedAtIso] = useState<string | null>(null);

  // 修正3: リアルタイムのカウント表示用
  const [rtProspectCount, setRtProspectCount] = useState<number>(0);
  const [rtSimilarCount, setRtSimilarCount] = useState<number>(0);

  /** ===== Effects: tenant & filters & local restore（初期表示のみ） ===== */
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

        // 直近表示の復元
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
          } else {
            localStorage.removeItem(LS_KEY);
          }
        }

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
          } else {
            localStorage.removeItem(LS_REJECT_KEY);
          }
        }

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

  /** ===== Helpers for fetch with retry (修正2) ===== */
  function isTransient(status: number) {
    return [408, 429, 500, 502, 503, 504].includes(status);
  }
  async function apiPostWithRetry<T = any>(
    url: string,
    body: any,
    headers: any
  ) {
    const maxRetry = 3;
    let lastErr: any = null;
    for (let i = 0; i <= maxRetry; i++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: abortRef.current?.signal,
        });
        const txt = await res.text();
        const j = txt ? JSON.parse(txt) : {};
        if (!res.ok && isTransient(res.status)) {
          lastErr = new Error(j?.error || `HTTP ${res.status}`);
          await delay(300 * (i + 1)); // 300ms, 600ms, 900ms, 1200ms
          continue;
        }
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        return j as T;
      } catch (e: any) {
        lastErr = e;
        // Abortされたら即 throw
        if (String(e?.name) === "AbortError") throw e;
        await delay(300 * (i + 1));
      }
    }
    throw lastErr || new Error("request failed");
  }

  /** ===== Filters summary（修正1: 20文字超は省略） ===== */
  const filterSummary = useMemo(() => {
    const trunc = (s: string, n = 20) =>
      (s || "").length > n ? s.slice(0, n) + "…" : s || "";
    const joinTrunc = (arr: string[]) => arr.map((x) => trunc(x)).join(" / ");

    const parts: string[] = [];
    if (filters.prefectures?.length)
      parts.push(`都道府県: ${joinTrunc(filters.prefectures)}`);
    if (filters.industries_large?.length)
      parts.push(`業種(大): ${joinTrunc(filters.industries_large)}`);
    if (filters.industries_small?.length)
      parts.push(`業種(小): ${joinTrunc(filters.industries_small)}`);
    if (filters.employee_size_ranges?.length)
      parts.push(`従業員: ${joinTrunc(filters.employee_size_ranges)}`);
    if (filters.keywords?.length)
      parts.push(`キーワード: ${joinTrunc(filters.keywords)}`);
    if (
      typeof filters.capital_min === "number" ||
      typeof filters.capital_max === "number"
    ) {
      const lo =
        typeof filters.capital_min === "number"
          ? formatJPY(filters.capital_min!)
          : "指定なし";
      const hi =
        typeof filters.capital_max === "number"
          ? formatJPY(filters.capital_max!)
          : "指定なし";
      parts.push(`資本金: ${lo} 〜 ${hi}`);
    }
    if (filters.established_from || filters.established_to) {
      parts.push(
        `設立: ${filters.established_from || "指定なし"} 〜 ${
          filters.established_to || "指定なし"
        }`
      );
    }
    return parts.join("　/　");
  }, [filters]);

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

    // 修正2: 「開始する」押下の瞬間を since に採用・既存表示をクリア
    const startIso = new Date().toISOString();
    setStartedAtIso(startIso);
    setAdded([]);
    setRejected([]);
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_REJECT_KEY);

    setRtProspectCount(0);
    setRtSimilarCount(0);

    await runLoop(fetchTotal, startIso);
  };

  /** 実行ループ（修正2: リトライ & 追い込み） */
  const runLoop = async (targetNew: number, sinceIso: string) => {
    if (!tenantId) return;
    setMsg("");
    setLoading(true);
    cancelledRef.current = false;

    setS(Array(totalSteps).fill("idle"));
    setActiveIdx(-1);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      // A-1
      setActiveIdx(0);
      setS((a) => a.map((v, i) => (i === 0 ? "running" : "idle")));
      await delay(150);
      setS((a) => a.map((v, i) => (i === 0 ? "done" : v)));
      setActiveIdx(-1);

      let attempts = 0;
      const MAX_ATTEMPTS = Math.max(10, targetNew * 6);
      const BATCH_BASE = Math.min(
        25,
        Math.max(8, Math.floor(Math.max(10, targetNew) / 4))
      );

      // ここからは DB の recent_count（since 以降）の**絶対値**をそのまま採用
      let recentProspectsCount = 0;
      let recentSimilarCount = 0;

      while (recentProspectsCount < targetNew && attempts < MAX_ATTEMPTS) {
        if (cancelledRef.current) throw new Error("ABORTED");
        attempts++;
        const leftover = Math.max(1, targetNew - recentProspectsCount);
        const wantNow = Math.min(BATCH_BASE, leftover);
        const seed = `${Date.now()}-${attempts}`;

        // Phase A: クロール〜キャッシュ
        setS((a) => a.map((v, i) => (i === 1 ? "running" : v)));
        try {
          await apiPostWithRetry(
            "/api/form-outreach/companies/crawl",
            { filters, want: wantNow, seed },
            { "x-tenant-id": tenantId }
          );
          setS((a) => a.map((v, idx) => (idx === 1 ? "done" : v)));
          setS((a) => a.map((v, idx) => (idx === 2 ? "done" : v)));
          setS((a) => a.map((v, idx) => (idx === 3 ? "done" : v)));
          setS((a) => a.map((v, idx) => (idx === 4 ? "done" : v)));
        } catch (e: any) {
          // 過渡エラーはリトライ内で処理済。ここまで来たら permanent とみなして継続。
          setS((a) => a.map((v, idx) => (idx === 1 ? "error" : v)));
          setMsg(`crawl failed: ${String(e?.message || e)}`);
        }

        // Phase B: 会社概要抽出 → 保存
        setS((a) => a.map((v, idx) => (idx === 5 ? "running" : v)));
        await delay(30);
        setS((a) => a.map((v, idx) => (idx === 5 ? "done" : v)));

        setS((a) => a.map((v, idx) => (idx === 6 ? "running" : v)));
        try {
          const ej = await apiPostWithRetry<{
            recent_rows: AddedRow[];
            recent_count: number;
            recent_similar_count: number;
            rejected: RejectedRow[];
          }>(
            "/api/form-outreach/companies/enrich",
            {
              since: sinceIso,
              want: leftover,
              try_llm: true,
            },
            { "x-tenant-id": tenantId }
          );

          setS((a) => a.map((v, idx) => (idx === 6 ? "done" : v)));

          // 表示は DB の “recent_rows” を採用（since 以降のみ）
          const recvRows: AddedRow[] = Array.isArray(ej?.recent_rows)
            ? (ej.recent_rows as AddedRow[])
            : [];
          setAdded(recvRows);
          localStorage.setItem(
            LS_KEY,
            JSON.stringify({ ts: new Date().toISOString(), rows: recvRows })
          );

          // 不適合は従来通り保持（重複除去）
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
              return next;
            });
          }

          // カウンタ更新
          recentProspectsCount = Number(ej?.recent_count || 0);
          recentSimilarCount = Number(ej?.recent_similar_count || 0);
          setRtProspectCount(recentProspectsCount);
          setRtSimilarCount(recentSimilarCount);

          // ループ継続ノード
          setS((a) => a.map((v, idx) => (idx === 7 ? "running" : v)));
          setMsg(
            `新規追加: ${recentProspectsCount}/${targetNew} 件 / 近似サイト（新規）: ${recentSimilarCount} 件`
          );
          await delay(30);
          setS((a) => a.map((v, idx) => (idx === 7 ? "done" : v)));
        } catch (e: any) {
          // enrich が 504 等で落ちても継続。attempts を消費しない
          setS((a) => a.map((v, idx) => (idx === 6 ? "error" : v)));
          attempts--;
          const msgText = String(e?.message || e);
          setMsg(
            msgText.includes("HTTP 504")
              ? "状態: enrich failed (504) / リトライ中…"
              : `状態: enrich failed / ${msgText}`
          );
          await delay(300);
          continue;
        }
      }

      // 最終追い込み（まだ未達ならもう一度だけ enrich）
      if (recentProspectsCount < targetNew) {
        try {
          const leftover = Math.max(1, targetNew - recentProspectsCount);
          setS((a) => a.map((v, idx) => (idx === 6 ? "running" : v)));
          const ej = await apiPostWithRetry<any>(
            "/api/form-outreach/companies/enrich",
            {
              since: sinceIso,
              want: leftover,
              try_llm: true,
            },
            { "x-tenant-id": tenantId }
          );
          setS((a) => a.map((v, idx) => (idx === 6 ? "done" : v)));

          const recvRows: AddedRow[] = Array.isArray(ej?.recent_rows)
            ? (ej.recent_rows as AddedRow[])
            : [];
          setAdded(recvRows);
          localStorage.setItem(
            LS_KEY,
            JSON.stringify({ ts: new Date().toISOString(), rows: recvRows })
          );

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
              return next;
            });
          }

          const rc = Number(ej?.recent_count || 0);
          const rs = Number(ej?.recent_similar_count || 0);
          recentProspectsCount = rc;
          recentSimilarCount = rs;
          setRtProspectCount(rc);
          setRtSimilarCount(rs);
        } catch {}
      }

      // 終了メッセージ（未達考慮）
      if (recentProspectsCount >= targetNew) {
        setMsg(
          `完了：新規追加が目標件数に達しました（${recentProspectsCount}/${targetNew} 件）`
        );
      } else {
        setMsg(
          `終了：新規追加は ${recentProspectsCount}/${targetNew} 件（未達）`
        );
      }
    } catch (e: any) {
      setActiveIdx(-1);
      setS((arr) => arr.map((v) => (v === "running" ? "error" : v)));
      if (String(e?.name) === "AbortError" || String(e?.message) === "ABORTED")
        setMsg("実行を中止しました。");
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
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

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
          </div>
          <div className="shrink-0 whitespace-nowrap flex gap-2">
            <Link
              href="/form-outreach/companies"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              企業一覧へ
            </Link>
            <Link
              href="/form-outreach/runs/manual"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              メッセージ手動送信へ
            </Link>
            <button
              onClick={handleRunButton}
              className={`inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 ${
                loading ? "text-red-700 border-red-300" : ""
              }`}
            >
              {loading ? (
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

        {/* フィルタ内容（修正1: 20文字で省略） */}
        <div className="mb-1 text-[12px] text-neutral-500">
          {filterSummary || "フィルタ：指定なし"}
        </div>

        {/* リアルタイムカウンタ */}
        <section className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-neutral-200 p-4 bg-white">
            <div className="text-xs text-neutral-500">
              今回新規追加（開始後のみカウント）
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {rtProspectCount}
              {startedAtIso && (
                <span className="ml-2 text-sm text-neutral-500">
                  / {fetchTotal}
                </span>
              )}
            </div>
            {startedAtIso && (
              <div className="mt-1 text-[11px] text-neutral-500">
                since {startedAtIso.replace("T", " ").replace("Z", "")}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 bg-white">
            <div className="text-xs text-neutral-500">近似サイト（新規）</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {rtSimilarCount}
            </div>
            <div className="mt-1 text-[11px] text-neutral-500">
              form_similar_sites の新規件数
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 bg-white">
            <div className="text-xs text-neutral-500">状態</div>
            <div className="mt-1 text-sm text-neutral-800 whitespace-pre-wrap">
              {msg || "待機中"}
            </div>
          </div>
        </section>

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

        {/* 今回追加テーブル */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              今回追加（開始後のみ・新しい順）
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-600">
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
                    "サイトURL",
                    "メール",
                    "電話",
                    "フォーム",
                    "規模",
                    "都道府県",
                    "業種",
                    "資本金",
                    "設立",
                    "法人番号",
                    "本店所在地",
                    "取得元",
                    "取得日時",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {added.map((c: AddedRow) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 whitespace-normal break-words min-w-[16ch] max-w-[24ch]">
                      {c.company_name || "-"}
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
                    <td className="px-3 py-2 whitespace-normal break-words min-w-[16ch] max-w-[24ch]">
                      {c.industry || "-"}
                    </td>
                    <td className="px-3 py-2">
                      {c.capital != null ? formatJPY(Number(c.capital)) : "-"}
                    </td>
                    <td className="px-3 py-2">{c.established_on || "-"}</td>
                    <td className="px-3 py-2">{c.corporate_number || "-"}</td>
                    <td className="px-3 py-2 whitespace-normal break-words min-w-[18ch]">
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
                      まだ表示する新規追加はありません（「開始する」押下以降の保存分のみ表示します）
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 不適合一覧 */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden mt-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              フィルタ不適合（直近12時間・重複除去済み / 直近取得が上）
            </div>
            <div className="text-xs text-neutral-500">
              表示件数: {rejected.length}
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
                    "本店所在地",
                    "メール",
                    "電話",
                    "フォーム",
                    "推定規模",
                    "業種",
                    "不採用理由",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rejected.map((r: RejectedRow, idx: number) => (
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
                    <td className="px-3 py-2 whitespace-normal break-words min-w-[18ch]">
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
                  </tr>
                ))}
                {rejected.length === 0 && (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      不適合データはありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
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
  // 修正1: running なら常に回転（activeに依存しない）
  const icon =
    state === "running" ? (
      <Loader2 className="h-6 w-6 animate-spin text-neutral-700" />
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
            ※ 取得件数は<strong>「開始する」押下時刻以降</strong>
            に保存された件数のみカウント＆表示します。
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

/** ===== Helpers ===== */
function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
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
