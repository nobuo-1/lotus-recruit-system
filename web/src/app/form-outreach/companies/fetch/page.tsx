// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  ChevronRight,
} from "lucide-react";

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
  note?: string;
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
  // 8フロー（フローチャート風）
  const [s, setS] = useState<StepState[]>(Array(8).fill("idle"));
  const [logs, setLogs] = useState<string[][]>(
    Array(8)
      .fill(null)
      .map(() => [])
  );
  const [activeIdx, setActiveIdx] = useState<number>(-1);

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

  // 削除選択
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const allSelected = added.length > 0 && selectedIds.length === added.length;

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

        // 最終件数
        const lastCount = Number(localStorage.getItem(LS_FETCH_COUNT));
        if (Number.isFinite(lastCount) && lastCount > 0)
          setFetchCount(Math.max(10, Math.min(2000, lastCount)));
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    // 追加リストが変わったら選択も同期
    setSelectedIds((prev) =>
      prev.filter((id) => added.some((r) => r.id === id))
    );
  }, [added]);

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

  const run = async (maxCount: number) => {
    if (anyRunning || loading) return;
    if (!tenantId) {
      setMsg("テナントが解決できませんでした。ログインを確認してください。");
      return;
    }

    setMsg("");
    setLoading(true);
    setAdded([]);
    setSelectedIds([]);
    setS(Array(8).fill("idle"));
    setLogs(
      Array(8)
        .fill(null)
        .map(() => [])
    );
    setActiveIdx(-1);

    try {
      // Step 1: 条件表示
      startStep(0, [
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
      completeStep(0);

      // API起動
      startStep(1, ["候補生成（LLM）…"]);
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

      await wait(300);
      completeStep(1);

      // 中間ステップをリアルタイム表示（API完了待ちの間）
      startStep(2, ["重複チェック（DB）…"]);
      await wait(300);
      completeStep(2);

      startStep(3, ["到達性チェック（HTTP）…"]);
      await wait(300);
      completeStep(3);

      startStep(4, ["フォーム探索（/contact 等）…"]);
      await wait(300);
      completeStep(4);

      startStep(5, ["メール抽出（本文から）…"]);
      await wait(300);
      completeStep(5);

      startStep(6, ["属性抽出（規模/都道府県/業種）…"]);
      await wait(300);
      completeStep(6);

      // 保存（API結果）
      startStep(7, ["DBへ保存しています…"]);
      const r = await apiPromise;
      const j: RunResult = await safeJson(r);
      if (!r.ok) throw new Error(j?.error || "fetch failed");

      const rows = Array.isArray(j.rows) ? j.rows : [];
      setAdded(rows);
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ ts: new Date().toISOString(), rows })
      );

      completeStep(7, [`保存完了：追加 ${j.inserted ?? rows.length} 件`]);
      setMsg(`実行完了：追加 ${j.inserted ?? rows.length} 件`);
    } catch (e: any) {
      failAllSteps();
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const cancelSelected = async () => {
    if (!tenantId || selectedIds.length === 0) return;
    try {
      const r = await fetch("/api/form-outreach/companies/cancel-additions", {
        method: "POST",
        headers: {
          "x-tenant-id": tenantId,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const j = await safeJson(r);
      if (!r.ok) throw new Error(j?.error || "cancel failed");
      setMsg(`取消しました：削除 ${j.deleted ?? 0} 件`);
      setAdded((rows) => rows.filter((r) => !selectedIds.includes(r.id)));
      setSelectedIds([]);
      // キャッシュも更新
      const rest = added.filter((r) => !selectedIds.includes(r.id));
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ ts: new Date().toISOString(), rows: rest })
      );
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  /** サマリ（固定改行でボタン1行維持） */
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

  // ステップ制御（フローチャートでアイコンを動かす）
  function startStep(idx: number, add: string[] = []) {
    setActiveIdx(idx);
    setS((arr) => arr.map((v, i) => (i === idx ? "running" : v)));
    if (add.length) setLogs((arr) => appendLog(arr, idx, add));
  }
  function completeStep(idx: number, add: string[] = []) {
    setS((arr) => arr.map((v, i) => (i === idx ? "done" : v)));
    if (add.length) setLogs((arr) => appendLog(arr, idx, add));
    setActiveIdx(-1);
  }
  function failAllSteps() {
    setS((arr) => arr.map((v) => (v === "done" ? v : "error")));
    setActiveIdx(-1);
  }

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

        {/* フローチャート */}
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

          {/* 横並びのフローチャート（小画面は折返し） */}
          <div className="overflow-x-auto">
            <div className="min-w-[900px] grid grid-flow-col auto-cols-fr items-stretch gap-2">
              {[
                "条件読み込み/表示",
                "候補生成（LLM）",
                "重複チェック（DB）",
                "到達性チェック（HTTP）",
                "フォーム探索",
                "メール抽出",
                "属性抽出（規模/都道府県/業種）",
                "保存（DB）",
              ].map((title, idx, arr) => (
                <React.Fragment key={idx}>
                  <FlowStep
                    title={title}
                    state={s[idx]}
                    active={activeIdx === idx}
                    logs={logs[idx]}
                  />
                  {idx < arr.length - 1 && <FlowArrow />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* 今回追加（横スクロール、ヘッダ横書き維持） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              今回追加（1日表示）{" "}
              <span className="text-xs text-neutral-500">
                （{added.length} / 目標 {fetchCount} 件）
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setSelectedIds(allSelected ? [] : added.map((r) => r.id))
                }
                disabled={added.length === 0}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50"
              >
                {allSelected ? "全解除" : "全選択"}
              </button>
              <button
                onClick={cancelSelected}
                disabled={selectedIds.length === 0}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50"
              >
                選択を取り消して削除
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked ? added.map((r) => r.id) : []
                        )
                      }
                    />
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    企業名
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    サイトURL
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    メール
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    フォーム
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    従業員規模
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    都道府県
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    業種
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    取得元
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    取得日時
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {added.map((c) => {
                  const checked = selectedIds.includes(c.id);
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedIds((ids) =>
                              e.target.checked
                                ? Array.from(new Set([...ids, c.id]))
                                : ids.filter((x) => x !== c.id)
                            )
                          }
                        />
                      </td>
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
                  );
                })}
                {added.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      新規追加はありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600">
            {msg}
          </pre>
        )}
      </main>

      {/* 件数モーダル */}
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

/** ---------- フローチャートUI ---------- */
function FlowStep({
  title,
  state,
  active,
  logs,
}: {
  title: string;
  state: StepState;
  active: boolean;
  logs: string[];
}) {
  const Icon =
    state === "running"
      ? Loader2
      : state === "done"
      ? CheckCircle
      : state === "error"
      ? XCircle
      : Play;
  const iconClass =
    state === "running"
      ? "h-6 w-6 animate-spin text-neutral-700"
      : state === "done"
      ? "h-6 w-6 text-emerald-600"
      : state === "error"
      ? "h-6 w-6 text-red-600"
      : "h-6 w-6 text-neutral-500";

  return (
    <div className="relative rounded-xl border border-neutral-200 bg-white p-3 shadow-sm flex flex-col">
      <div className="flex items-center gap-2">
        <Icon className={iconClass} />
        <div className="text-sm font-semibold text-neutral-800">{title}</div>
      </div>
      <div className="mt-2 rounded-lg border border-neutral-200 p-2 min-h-[58px] bg-neutral-50">
        {logs.length === 0 ? (
          <div className="text-[11px] text-neutral-500">ログはありません</div>
        ) : (
          <div className="text-[11px] text-neutral-700 space-y-1">
            {logs.map((l, i) => (
              <div key={i}>• {l}</div>
            ))}
          </div>
        )}
      </div>
      {active && (
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 text-white text-[10px] px-2 py-0.5 animate-pulse">
          実行中
        </div>
      )}
    </div>
  );
}
function FlowArrow() {
  return (
    <div className="flex items-center justify-center">
      <ChevronRight className="h-5 w-5 text-neutral-400" />
    </div>
  );
}

/** ---------- 共通UI ---------- */
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

/** ---------- helpers ---------- */
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
function appendLog(arr: string[][], idx: number, lines: string[]) {
  const next = arr.map((v) => v.slice());
  next[idx].push(...lines);
  return next;
}
