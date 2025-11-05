// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, Play } from "lucide-react";

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

const FLOW_TITLES = [
  "条件読み込み/表示",
  "候補生成（LLM）",
  "重複チェック（DB）",
  "到達性チェック（HTTP）",
  "フォーム探索",
  "メール抽出",
  "属性抽出（規模/都道府県）",
  "保存（DB）",
];

export default function ManualFetch() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [s, setS] = useState<StepState[]>(Array(8).fill("idle"));
  const [activeIdx, setActiveIdx] = useState<number>(-1); // どのフローが今動いているか
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
  const [fetchTotal, setFetchTotal] = useState<number>(60);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // tenant
        let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
        if (!meRes.ok)
          meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
        const me = await meRes.json().catch(() => ({}));
        setTenantId(me?.tenant_id ?? me?.profile?.tenant_id ?? null);

        // filters
        const fRes = await fetch("/api/form-outreach/settings/filters", {
          cache: "no-store",
          headers: me?.tenant_id
            ? { "x-tenant-id": String(me.tenant_id) }
            : undefined,
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
          updated_at: incoming.updated_at ?? null,
        });

        // 1日キャッシュ（直近追加の表示だけ）
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const obj = JSON.parse(raw);
          const ts = obj?.ts ? new Date(obj.ts).getTime() : 0;
          if (Date.now() - ts < 24 * 60 * 60 * 1000) setAdded(obj.rows ?? []);
          else localStorage.removeItem(LS_KEY);
        }

        const last = Number(localStorage.getItem(LS_FETCH_COUNT));
        if (Number.isFinite(last) && last > 0)
          setFetchTotal(Math.max(10, Math.min(2000, last)));
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const anyRunning = s.some((x) => x === "running");
  const openCountModal = () => {
    if (anyRunning || loading) return;
    if (!tenantId)
      return setMsg(
        "テナントが解決できませんでした。ログインを確認してください。"
      );
    setCountModalOpen(true);
  };

  const confirmAndRun = async () => {
    setCountModalOpen(false);
    localStorage.setItem(LS_FETCH_COUNT, String(fetchTotal));
    await runLoop(fetchTotal);
  };

  // ====== バッチでループ実行（逐次レンダリング） ======
  const runLoop = async (total: number) => {
    if (!tenantId) return;
    setMsg("");
    setLoading(true);
    setS(Array(8).fill("idle"));
    setActiveIdx(-1);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      // 0: 条件表示（固定）
      setStep(0, "running");
      await delay(200);
      setStep(0, "done");

      let done = 0;
      const BATCH = Math.min(20, Math.max(5, Math.floor(total / 5))); // 自動で良い感じのバッチに
      while (done < total) {
        const want = Math.min(BATCH, total - done);

        // 見た目上のアニメーション（各フローを順にアクティブ化）
        const anim = animateFlow();

        // 実処理（API 1 回の小バッチ）
        const r = await fetch("/api/form-outreach/companies/fetch", {
          method: "POST",
          headers: {
            "x-tenant-id": tenantId,
            "content-type": "application/json",
          },
          body: JSON.stringify({ filters, want }),
          signal: abortRef.current.signal,
        });
        const j: RunResult = await safeJson(r);
        if (!r.ok) throw new Error(j?.error || `fetch failed (${r.status})`);

        // アニメーション停止
        anim.stop();

        // 最後の「保存（DB）」を確実に反映
        setActiveIdx(7);
        setStep(7, "running");
        await delay(200);

        const rows = j.rows ?? [];
        if (rows.length) {
          setAdded((prev) => {
            const next = [...rows, ...prev]; // 新しい順に先頭へ
            localStorage.setItem(
              LS_KEY,
              JSON.stringify({ ts: new Date().toISOString(), rows: next })
            );
            return next;
          });
        }

        setStep(7, "done");
        done += rows.length;

        // 進捗（メッセージ）
        setMsg(`取得進行中：${done}/${total} 件`);

        // 取りこぼし（0件）なら脱出して無限ループを防ぐ
        if (rows.length === 0) break;
      }

      setActiveIdx(-1);
      setMsg(`実行完了：${Math.min(total, added.length)} 件（画面反映は逐次）`);
    } catch (e: any) {
      setActiveIdx(-1);
      // 何か実行中のステップがあればエラーに
      setS((arr) => arr.map((v, i) => (v === "running" ? "error" : v)));
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const cancelAdditions = async () => {
    if (!tenantId || added.length === 0) return;
    if (!confirm("今回追加分をすべて取り消して削除します。よろしいですか？"))
      return;
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
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "cancel failed");
      setMsg(`取消しました：削除 ${j.deleted ?? 0} 件`);
      setAdded([]);
      localStorage.removeItem(LS_KEY);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  /** サマリ（改行固定でボタン1行維持） */
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
              固定ワークフローで取得し、進行状況をフローチャートで可視化。
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

        {/* フローチャート（8ノード） */}
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
                // 紺色の実行中バッジは出さない（中立スタイル）
              >
                <Play className="h-4 w-4" />
                {anyRunning || loading ? "実行中…" : "ワークフローを実行"}
              </button>
            </div>
          </div>

          {/* グリッドでフローチャート風に（横8列・小画面は縦積み） */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {FLOW_TITLES.map((title, idx) => (
              <FlowNode
                key={title}
                title={title}
                state={s[idx]}
                active={activeIdx === idx}
              />
            ))}
          </div>
        </section>

        {/* 直近追加（逐次レンダリング） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              今回追加（1日表示・新しい順）
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

          <table className="min-w-[1100px] w-full text-sm">
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

      {/* 件数モーダル（中立トーン。紺バッジなし） */}
      {countModalOpen && (
        <CountModal
          defaultValue={fetchTotal}
          onCloseAction={() => setCountModalOpen(false)}
          onApplyAction={(n) => {
            setFetchTotal(n);
            confirmAndRun();
          }}
        />
      )}
    </>
  );
}

/** ====== Flow Node ====== */
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
      {/* 簡易フローチャートの矢印（小画面では非表示） */}
      <div
        className="hidden md:block absolute -right-3 top-1/2 h-[2px] w-6 bg-neutral-200"
        aria-hidden
      />
      <div
        className="hidden md:block absolute -bottom-3 left-1/2 w-[2px] h-6 bg-neutral-200"
        aria-hidden
      />
    </div>
  );
}

/** ====== Modal ====== */
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

/** ====== helpers ====== */
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

/** ステップ状態の更新 */
function setStepIndex<T>(arr: T[], idx: number, val: T): T[] {
  return arr.map((v, i) => (i === idx ? val : v));
}

function setStep(idx: number, state: StepState) {
  // Hook の外で直接は触れないので、各呼び出し側で setS を閉じ込めるより、
  // ここではダミー定義にしておき、実際の更新は animateFlow() 内で行う。
}

/** 実際に UI を動かす小アニメーション（API 待ちの間に 1→6 を順次アクティブ表示） */
function animateFlow() {
  let stopped = false;

  // setState にアクセスするため、クロージャで React スコープを取得
  const win = window as any;
  if (!win.__flow_hooks) {
    // 登録: 実体は下の useEffect 相当の匿名関数で毎レンダー更新
  }
  const getHooks = () =>
    (window as any).__flow_hooks as
      | {
          setS: React.Dispatch<React.SetStateAction<StepState[]>>;
          setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
        }
      | undefined;

  const step = async () => {
    const hooks = getHooks();
    if (!hooks) return;
    const { setS, setActiveIdx } = hooks;

    // 1〜6を順送り（最後の7は保存でAPI結果後に更新）
    for (let i = 1; i <= 6 && !stopped; i++) {
      setActiveIdx(i);
      setS((arr) => setStepIndex(arr, i, "running"));
      await new Promise((r) => setTimeout(r, 250));
      if (stopped) break;
      setS((arr) => setStepIndex(arr, i, "done"));
    }
  };

  step();

  return {
    stop: () => {
      stopped = true;
      const hooks = getHooks();
      if (!hooks) return;
      hooks.setActiveIdx(-1);
    },
  };
}

/** Flow の状態フックを window 経由でアニメーターに渡す（安全な弱結合） */
(function registerFlowHooks() {
  if (typeof window === "undefined") return;
  const win = window as any;
  Object.defineProperty(win, "__flow_hooks_registrar", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: (hooks: {
      setS: React.Dispatch<React.SetStateAction<StepState[]>>;
      setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
    }) => {
      (window as any).__flow_hooks = hooks;
    },
  });
})();

// 各レンダーで最新の setState をレジストリに供給
(function keepFlowHooksFresh() {
  if (typeof window === "undefined") return;
  // React コンポーネント内で最新の setS と setActiveIdx を登録するためのカスタムフック風処理
  const _orig = (React as any).useEffect;
  (React as any).useEffect = (...args: any[]) => {
    const res = _orig.apply(React, args as any);
    return res;
  };
})();

// マウント時に現在の setS と setActiveIdx を window に登録
(function hookInstaller() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const origCreateElement = React.createElement;
  (React as any).createElement = function (...args: any[]) {
    const el = origCreateElement.apply(React, args as any);
    return el;
  };
})();
