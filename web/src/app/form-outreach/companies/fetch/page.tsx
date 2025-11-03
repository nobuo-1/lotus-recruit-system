// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, Play, ChevronDown } from "lucide-react";

const LS_KEY = "fo_manual_fetch_latest";
const LS_FETCH_COUNT = "fo_manual_fetch_count";

type StepState = "idle" | "running" | "done" | "error";

type AddedRow = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  contact_form_url?: string | null;
  industry?: string | null;
  company_size?: string | null;
  prefectures?: string[] | null;
  job_site_source?: string | null;
  source_site?: string | null;
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
  industries_large: string[];
  industries_small: string[];
  updated_at?: string | null;
};

export default function ManualFetch() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [msg, setMsg] = useState("");
  // 8フロー
  const [s, setS] = useState<StepState[]>(Array(8).fill("idle"));
  const [logs, setLogs] = useState<string[][]>(
    Array(8)
      .fill([])
      .map(() => [])
  );

  const [open, setOpen] = useState<boolean[]>([
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);

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

  const [countModalOpen, setCountModalOpen] = useState(false);
  const [fetchCount, setFetchCount] = useState<number>(60);

  useEffect(() => {
    (async () => {
      try {
        // tenant
        let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
        if (!meRes.ok)
          meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
        const me = await safeJson(meRes);
        setTenantId(me?.tenant_id ?? me?.profile?.tenant_id ?? null);

        // filters
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
          industries_small: Array.isArray(incoming.industries_small)
            ? incoming.industries_small
            : Array.isArray(incoming.industries)
            ? incoming.industries
            : [],
          updated_at: incoming.updated_at ?? null,
        });

        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const obj = JSON.parse(raw);
          const ts = obj?.ts ? new Date(obj.ts).getTime() : 0;
          if (Date.now() - ts < 24 * 60 * 60 * 1000) setAdded(obj.rows ?? []);
          else localStorage.removeItem(LS_KEY);
        }

        const lastCount = Number(localStorage.getItem(LS_FETCH_COUNT));
        if (Number.isFinite(lastCount) && lastCount > 0)
          setFetchCount(Math.max(10, Math.min(2000, lastCount)));
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const anyRunning = s.some((x) => x === "running");

  const openCountModal = () => {
    if (anyRunning || loading) return;
    if (!tenantId) {
      setMsg("テナントが解決できませんでした。ログインを確認してください。");
      return;
    }
    setCountModalOpen(true);
  };

  const confirmAndRun = async () => {
    setCountModalOpen(false);
    localStorage.setItem(LS_FETCH_COUNT, String(fetchCount));
    await run(fetchCount);
  };

  /** ステップ状態更新ヘルパ（未定義エラー解消 & 画面更新一括制御） */
  const setStep = (idx: number, state: StepState, addLogs: string[] = []) => {
    setS((arr) => arr.map((v, i) => (i === idx ? state : v)));
    if (addLogs.length) {
      setLogs((arr) => {
        const next = arr.map((v) => v.slice());
        next[idx].push(...addLogs);
        return next;
      });
    }
  };
  const bump = async (idx: number) => {
    await wait(250);
    setStep(idx, "done");
  };
  const failAll = () => {
    setS((arr) => arr.map((v) => (v === "running" ? "error" : v)));
  };

  const run = async (maxCount: number) => {
    if (anyRunning || loading) return;
    if (!tenantId) {
      setMsg("テナントが解決できませんでした。ログインを確認してください。");
      return;
    }

    setMsg("");
    setLoading(true);
    setAdded([]);
    setS(Array(8).fill("idle"));
    setLogs(
      Array(8)
        .fill([])
        .map(() => [])
    );
    setOpen([true, true, false, false, false, false, false, false]);

    try {
      // Step 1: 条件表示
      setStep(0, "running", [
        `取得件数: ${maxCount}件`,
        `都道府県: ${filters.prefectures.join(", ") || "全国"}`,
        `規模: ${filters.employee_size_ranges.join(", ") || "指定なし"}`,
        `KW: ${filters.keywords.join(", ") || "指定なし"}`,
        `業種(大): ${filters.industries_large.join(", ") || "指定なし"}`,
        `業種(小): ${
          filters.industries_small.slice(0, 10).join(", ") || "指定なし"
        }${filters.industries_small.length > 10 ? " …" : ""}`,
      ]);
      await wait(250);
      setStep(0, "done");

      // ここでAPIを先行起動
      const apiPromise = fetch("/api/form-outreach/companies/fetch", {
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
            max: maxCount,
          },
        }),
      });

      // Step 2〜7 を段階表示（裏でAPIが進行）
      setStep(1, "running", ["候補生成（LLM）…"]);
      await bump(1);

      setStep(2, "running", ["既存DBと重複チェック…"]);
      await bump(2);

      setStep(3, "running", ["到達性チェック（HTTP）…"]);
      await bump(3);

      setStep(4, "running", ["お問い合わせフォーム探索（/contact 等）…"]);
      await bump(4);

      setStep(5, "running", ["メール抽出（本文から抽出）…"]);
      await bump(5);

      setStep(6, "running", ["属性抽出（従業員規模/都道府県）…"]);
      await bump(6);

      // Step 8: 保存（APIの結果反映）
      setOpen((o) => o.map((v, i) => (i <= 6 ? true : v)));
      setStep(7, "running", ["DBへ保存しています…"]);
      const r = await apiPromise;
      const j: RunResult = await safeJson(r);
      if (!r.ok) throw new Error(j?.error || "fetch failed");

      const rows = j.rows ?? [];
      setAdded(rows);
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ ts: new Date().toISOString(), rows })
      );

      setStep(7, "done", [`保存完了：追加 ${j.inserted ?? rows.length} 件`]);
      setMsg(`実行完了：追加 ${j.inserted ?? rows.length} 件`);
    } catch (e: any) {
      failAll();
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const cancelAdditions = async () => {
    if (!tenantId || added.length === 0) return;
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

  /** サマリ（固定改行でボタンが1行維持） */
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
    return { pref, size, kw, ind };
  }, [filters]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-neutral-900">
              企業リスト手動取得
            </h1>
            <p className="text-sm text-neutral-500">
              固定ワークフローで取得します。各ステップの進行状況を可視化します。
            </p>
            <p className="text-xs text-neutral-500 mt-1 break-words">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span> /
              <br />
              現在のフィルタ:{" "}
              <span className="opacity-80">
                都道府県={summaryParts.pref} / 規模={summaryParts.size}
              </span>
              <br />
              <span className="opacity-80">KW={summaryParts.kw}</span>
              <br />
              <span className="opacity-80">業種={summaryParts.ind}</span>
            </p>
          </div>
          <div className="shrink-0 whitespace-nowrap">
            <Link
              href="/form-outreach/companies"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              企業一覧へ
            </Link>
          </div>
        </div>

        {/* 8フロー */}
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
                onClick={openCountModal}
                disabled={anyRunning || loading}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {anyRunning || loading ? "実行中…" : "ワークフローを実行"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              "条件読み込み/表示",
              "候補生成（LLM）",
              "重複チェック（DB）",
              "到達性チェック（HTTP）",
              "フォーム探索",
              "メール抽出",
              "属性抽出（規模/都道府県）",
              "保存（DB）",
            ].map((title, idx) => (
              <StepCard
                key={idx}
                title={title}
                state={s[idx]}
                open={open[idx]}
                onToggle={() =>
                  setOpen((o) => o.map((v, i) => (i === idx ? !v : v)))
                }
              >
                <Logs items={logs[idx]} />
              </StepCard>
            ))}
          </div>
        </section>

        {/* 直近追加 */}
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
                <th className="px-3 py-3 text-left">フォーム</th>
                <th className="px-3 py-3 text-left">規模</th>
                <th className="px-3 py-3 text-left">都道府県</th>
                <th className="px-3 py-3 text-left">業種</th>
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
                  <td className="px-3 py-2">{c.industry || "-"}</td>
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
                    colSpan={9}
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

      {/* 件数モーダル（既存デザイン維持） */}
      {countModalOpen && (
        <CountModal
          defaultValue={fetchCount}
          onCloseAction={() => setCountModalOpen(false)}
          onApplyAction={(n) => {
            setFetchCount(n);
            confirmAndRun();
          }}
        />
      )}
    </>
  );
}

/** ----- UI helpers ----- */
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
async function safeJson(res: Response) {
  try {
    const t = await res.text();
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}

/** 件数指定モーダル（デザイン維持） */
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
  const clampVal = (v: number) => Math.max(10, Math.min(2000, Math.floor(v)));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[520px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="font-semibold">実行件数の指定</div>
          <button
            onClick={onCloseAction}
            className="rounded-lg px-2 py-1 border border-neutral-300 hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-neutral-700">
            収集する企業数を指定してください（10〜2000件）。
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={2000}
              step={10}
              value={n}
              onChange={(e) => setN(clampVal(Number(e.target.value)))}
              className="w-full"
            />
            <input
              type="number"
              min={10}
              max={2000}
              step={10}
              value={n}
              onChange={(e) => setN(clampVal(Number(e.target.value)))}
              className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <p className="text-[11px] text-neutral-500">
            ※ 大きい値を指定すると完了まで時間がかかる可能性があります。
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
            実行する
          </button>
        </div>
      </div>
    </div>
  );
}
