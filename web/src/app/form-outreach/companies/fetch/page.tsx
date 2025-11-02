// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, Play, ChevronDown } from "lucide-react";

const LS_KEY = "fo_manual_fetch_latest"; // 1日キャッシュ

type StepState = "idle" | "running" | "done" | "error";

type AddedRow = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  job_site_source?: string | null; // APIの返却名に合わせる
  source_site?: string | null; // 後方互換
  created_at: string | null;
};

type RunResult = {
  inserted?: number;
  rows?: AddedRow[];
  error?: string;
};

type Filters = {
  prefectures: string[];
  employee_size_ranges: string[];
  keywords: string[];
  // ↓ 職種は廃止。業種に統一
  industries_large: string[]; // 大分類
  industries_small: string[]; // 小分類
  updated_at?: string | null;
};

export default function ManualFetch() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [msg, setMsg] = useState("");
  const [s1, setS1] = useState<StepState>("idle"); // 収集
  const [s2, setS2] = useState<StepState>("idle"); // 解析
  const [s3, setS3] = useState<StepState>("idle"); // 保存

  const [log1, setLog1] = useState<string[]>([]);
  const [log2, setLog2] = useState<string[]>([]);
  const [log3, setLog3] = useState<string[]>([]);

  const [open1, setOpen1] = useState(false);
  const [open2, setOpen2] = useState(false);
  const [open3, setOpen3] = useState(false);

  const [added, setAdded] = useState<AddedRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    prefectures: [],
    employee_size_ranges: [],
    keywords: [],
    industries_large: [],
    industries_small: [],
    updated_at: null,
  });

  // 初期ロード：テナントとフィルタ、1日キャッシュ
  useEffect(() => {
    (async () => {
      try {
        // テナント
        let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
        if (!meRes.ok) {
          // 404対策で末尾スラありも再試行
          const meRes2 = await fetch("/api/me/tenant/", { cache: "no-store" });
          meRes = meRes2;
        }
        const me = await safeJson(meRes);
        setTenantId(me?.tenant_id ?? me?.profile?.tenant_id ?? null);

        // フィルタ
        const fRes = await fetch("/api/form-outreach/settings/filters", {
          cache: "no-store",
          headers: me?.tenant_id
            ? { "x-tenant-id": String(me.tenant_id) }
            : undefined,
        });
        const fj = await safeJson(fRes);
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
          // 後方互換（旧: job_titles/industries から拾っておく）
          industries_small: Array.isArray(incoming.industries_small)
            ? incoming.industries_small
            : Array.isArray(incoming.industries)
            ? incoming.industries
            : Array.isArray(incoming.job_titles)
            ? incoming.job_titles
            : [],
          updated_at: incoming.updated_at ?? null,
        });

        // 1日キャッシュ
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const obj = JSON.parse(raw);
          const ts = obj?.ts ? new Date(obj.ts).getTime() : 0;
          if (Date.now() - ts < 24 * 60 * 60 * 1000) {
            setAdded(obj.rows ?? []);
          } else {
            localStorage.removeItem(LS_KEY);
          }
        }
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const anyRunning = s1 === "running" || s2 === "running" || s3 === "running";

  const run = async () => {
    if (anyRunning || loading) return;
    if (!tenantId) {
      setMsg("テナントが解決できませんでした。ログインを確認してください。");
      return;
    }
    setMsg("");
    setLoading(true);
    setS1("running");
    setS2("idle");
    setS3("idle");
    setAdded([]);
    setLog1([]);
    setLog2([]);
    setLog3([]);

    try {
      // ステップ1: 収集（検索クエリの表示）
      setOpen1(true);
      setLog1((v) => [
        ...v,
        `都道府県: ${filters.prefectures.join(", ") || "全国"}`,
        `規模: ${filters.employee_size_ranges.join(", ") || "指定なし"}`,
        `キーワード: ${filters.keywords.join(", ") || "指定なし"}`,
        // 職種 → 業種（薄字ログに業種を反映）
        `業種(大): ${filters.industries_large.join(", ") || "指定なし"}`,
        `業種(小): ${
          filters.industries_small.slice(0, 10).join(", ") || "指定なし"
        }${filters.industries_small.length > 10 ? " …" : ""}`,
      ]);
      await wait(300);
      setS1("done");

      // ステップ2: 解析（見せ方上ログ）
      setOpen2(true);
      setS2("running");
      setLog2((v) => [
        ...v,
        "候補サイトのタイトル/メール/採用・問い合わせリンク解析…",
      ]);
      await wait(300);

      // ステップ3: 保存（API実行）— 送信は「業種のみ」
      setS2("done");
      setOpen3(true);
      setS3("running");
      setLog3((v) => [...v, "DBへ保存しています…"]);

      const r = await fetch("/api/form-outreach/companies/fetch", {
        method: "POST",
        headers: {
          "x-tenant-id": tenantId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          filters: {
            prefectures: filters.prefectures,
            employee_size_ranges: filters.employee_size_ranges,
            keywords: filters.keywords,
            industries_large: filters.industries_large,
            industries_small: filters.industries_small,
            max: 60,
          },
        }),
      });

      const j: RunResult = await safeJson(r);
      if (!r.ok) throw new Error(j?.error || "fetch failed");

      setS3("done");
      const rows = j.rows ?? [];
      setAdded(rows);

      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ ts: new Date().toISOString(), rows })
      );
      setLog3((v) => [...v, `保存完了：追加 ${j.inserted ?? rows.length} 件`]);
      setMsg(`実行完了：追加 ${j.inserted ?? rows.length} 件`);
    } catch (e: any) {
      setS1((v) => (v === "running" ? "error" : v));
      setS2((v) => (v === "running" ? "error" : v));
      setS3((v) => (v === "running" ? "error" : v));
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const cancelAdditions = async () => {
    if (!tenantId) return;
    if (added.length === 0) return;
    const ids = added.map((r) => r.id);
    try {
      const r = await fetch("/api/form-outreach/companies/cancel-additions", {
        method: "POST",
        headers: {
          "x-tenant-id": tenantId,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });
      const j = await safeJson(r);
      if (!r.ok) throw new Error(j?.error || "cancel failed");
      setMsg(`取消しました：削除 ${j.deleted ?? 0} 件`);
      setAdded([]);
      localStorage.removeItem(LS_KEY);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  // フィルタ要約（上部に表示：デザイン維持・表現のみ「職種→業種」に変更）
  const filtersSummary = useMemo(() => {
    const a: string[] = [];
    a.push(
      `都道府県=${
        filters.prefectures.length ? filters.prefectures.join(" / ") : "全国"
      }`
    );
    a.push(
      `規模=${
        filters.employee_size_ranges.length
          ? filters.employee_size_ranges.join(" / ")
          : "指定なし"
      }`
    );
    a.push(
      `KW=${
        filters.keywords.length ? filters.keywords.join(" / ") : "指定なし"
      }`
    );
    // 職種→業種
    const indLabel =
      filters.industries_small.length > 0
        ? filters.industries_small.slice(0, 6).join(" / ") +
          (filters.industries_small.length > 6 ? " …" : "")
        : filters.industries_large.length > 0
        ? filters.industries_large.join(" / ")
        : "指定なし";
    a.push(`業種=${indLabel}`);
    return a.join(" / ");
  }, [filters]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              企業リスト手動取得
            </h1>
            <p className="text-sm text-neutral-500">
              固定ワークフローで取得します。各ステップの進行状況を可視化します。
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span> /
              現在のフィルタ:{" "}
              <span className="opacity-80">{filtersSummary}</span>
            </p>
          </div>
          <Link
            href="/form-outreach/companies"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            企業一覧へ
          </Link>
        </div>

        {/* ワークフロー可視化 */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-800">フロー</div>
            <div className="flex items-center gap-2">
              <Link
                href="/form-outreach/settings/filters"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
              >
                取得フィルタ設定へ
              </Link>
              <button
                onClick={run}
                disabled={anyRunning || loading}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {anyRunning || loading ? "実行中…" : "ワークフローを実行"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StepCard
              title="収集（スクレイピング）"
              state={s1}
              open={open1}
              onToggle={() => setOpen1((v) => !v)}
            >
              <Logs items={log1} />
            </StepCard>
            <StepCard
              title="解析（正規化・抽出）"
              state={s2}
              open={open2}
              onToggle={() => setOpen2((v) => !v)}
            >
              <Logs items={log2} />
            </StepCard>
            <StepCard
              title="保存（DBへ反映）"
              state={s3}
              open={open3}
              onToggle={() => setOpen3((v) => !v)}
            >
              <Logs items={log3} />
            </StepCard>
          </div>
        </section>

        {/* 直近追加（1日だけ保持） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              今回追加（1日表示）
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={cancelAdditions}
                disabled={added.length === 0}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50"
              >
                取り消して削除
              </button>
            </div>
          </div>

          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">企業名</th>
                <th className="px-3 py-3 text-left">サイトURL</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">取得元</th>
                <th className="px-3 py-3 text-left">取得日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {added.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.company_name || "-"}</td>
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
                  <td className="px-3 py-2">
                    {c.job_site_source || c.source_site || "-"}
                  </td>
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
                    colSpan={5}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    新規追加はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}

function StepCard({
  title,
  state,
  open,
  onToggle,
  children,
}: {
  title: string;
  state: StepState;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const icon =
    state === "running" ? (
      <Loader2 className="h-8 w-8 animate-spin text-neutral-700" />
    ) : state === "done" ? (
      <CheckCircle className="h-8 w-8 text-emerald-600" />
    ) : state === "error" ? (
      <XCircle className="h-8 w-8 text-red-600" />
    ) : (
      <Play className="h-8 w-8 text-neutral-500" />
    );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between"
        aria-expanded={open}
        aria-controls={title}
      >
        <div>
          <div className="text-sm font-semibold text-neutral-800">{title}</div>
          <div className="text-xs text-neutral-500">
            {state === "idle" && "待機中"}
            {state === "running" && "実行中…"}
            {state === "done" && "完了"}
            {state === "error" && "失敗"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {icon}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>
      {open && <div className="pt-3">{children}</div>}
    </div>
  );
}

function Logs({ items }: { items: string[] }) {
  if (!items.length)
    return (
      <div className="rounded-lg border border-neutral-200 p-3 text-xs text-neutral-500">
        ログはありません
      </div>
    );
  return (
    <div className="rounded-lg border border-neutral-200 p-3 text-xs text-neutral-700 space-y-1">
      {items.map((l, i) => (
        <div key={i}>• {l}</div>
      ))}
    </div>
  );
}

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// 404でHTMLが返っても安全に処理
async function safeJson(res: Response) {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
