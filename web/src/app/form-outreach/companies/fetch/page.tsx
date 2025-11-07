// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, Play, Plus } from "lucide-react";

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
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
  created_at: string | null;
};

type RejectedRow = Omit<AddedRow, "id" | "created_at"> & {
  reject_reasons: string[];
};

type RunResult = {
  inserted?: number;
  rows?: AddedRow[];
  rejected?: RejectedRow[];
  error?: string;
  note?: string;
};

type Filters = {
  prefectures: string[];
  employee_size_ranges: string[];
  keywords: string[];
  industries_large: string[];
  industries_small: string[];
  // 追加
  capital_min?: number | null;
  capital_max?: number | null;
  established_from?: string | null;
  established_to?: string | null;

  updated_at?: string | null;
};

// ★ フローは11段構成
const FLOW_TITLES = [
  "条件読み込み/表示",
  "地域サンプリング（都道府県）",
  "候補生成（国税庁ベース）",
  "登記付与（資本金/設立）",
  "事前フィルタ（資本金/設立）",
  "公式サイト解決（LLM）",
  "到達性チェック（HTTP）",
  "フォーム探索",
  "メール抽出",
  "属性抽出（従業員/都道府県/業種）",
  "保存（DB）",
];

export default function ManualFetch() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [s, setS] = useState<StepState[]>(
    Array(FLOW_TITLES.length).fill("idle")
  );
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [added, setAdded] = useState<AddedRow[]>([]);
  const [rejected, setRejected] = useState<RejectedRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  const [countModalOpen, setCountModalOpen] = useState(false);
  const [fetchTotal, setFetchTotal] = useState<number>(60);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      try {
        let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
        if (!meRes.ok)
          meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
        const me = await meRes.json().catch(() => ({}));
        setTenantId(me?.tenant_id ?? me?.profile?.tenant_id ?? null);

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
          capital_min: Number.isFinite(incoming.capital_min)
            ? incoming.capital_min
            : null,
          capital_max: Number.isFinite(incoming.capital_max)
            ? incoming.capital_max
            : null,
          established_from: incoming.established_from ?? null,
          established_to: incoming.established_to ?? null,
          updated_at: incoming.updated_at ?? null,
        });

        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const obj = JSON.parse(raw);
          const ts = obj?.ts ? new Date(obj.ts).getTime() : 0;
          if (Date.now() - ts < 24 * 3600 * 1000) setAdded(obj.rows ?? []);
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

  /** 逐次保存 & 逐次レンダリング。必ず total 件を目指し、上限試行まで自動再試行 */
  const runLoop = async (total: number) => {
    if (!tenantId) return;
    setMsg("");
    setLoading(true);
    setS(Array(FLOW_TITLES.length).fill("idle"));
    setActiveIdx(-1);
    setRejected([]);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      // 0: 条件表示
      setActiveIdx(0);
      setS((a) => a.map((v, i) => (i === 0 ? "running" : "idle")));
      await delay(200);
      setS((a) => a.map((v, i) => (i === 0 ? "done" : v)));
      setActiveIdx(-1);

      let done = 0;
      let attempts = 0;
      const MAX_ATTEMPTS = Math.ceil(total / 5) + 10;
      const BATCH = Math.min(25, Math.max(8, Math.floor(total / 4)));

      while (done < total && attempts < MAX_ATTEMPTS) {
        attempts++;
        const want = Math.min(BATCH, total - done);
        const seed = `${Date.now()}-${attempts}`;

        // フローの擬似進行（1→9を順回し）
        const anim = animateSteps(setS, setActiveIdx, { start: 1, end: 9 });

        const r = await fetch("/api/form-outreach/companies/fetch", {
          method: "POST",
          headers: {
            "x-tenant-id": tenantId,
            "content-type": "application/json",
          },
          body: JSON.stringify({ filters, want, seed }),
          signal: abortRef.current.signal,
        });
        const j: RunResult = await safeJson(r);

        // 保存（10）を明示
        anim.stop();
        setActiveIdx(10);
        setS((a) =>
          a.map((v, i) =>
            i === 10
              ? "running"
              : i <= 9
              ? a[i] === "idle"
                ? "done"
                : a[i]
              : v
          )
        );
        await delay(150);

        if (!r.ok) throw new Error(j?.error || `fetch failed (${r.status})`);

        const rows = j.rows ?? [];
        const rej = j.rejected ?? [];

        if (rows.length) {
          setAdded((prev) => {
            const next = [...rows, ...prev];
            localStorage.setItem(
              LS_KEY,
              JSON.stringify({ ts: new Date().toISOString(), rows: next })
            );
            return next;
          });
        }
        if (rej.length) {
          setRejected((prev) => [...rej, ...prev].slice(0, 1000));
        }

        const inc = Number.isFinite(j.inserted)
          ? Number(j.inserted)
          : rows.length;
        done += inc;

        setS((a) => a.map((v, i) => (i === 10 ? "done" : v)));
        setActiveIdx(-1);
        setMsg(`取得進行中：${done}/${total} 件`);

        if (inc === 0) {
          await delay(300);
          continue;
        }
      }

      setMsg(
        done >= total
          ? `実行完了：${done}/${total} 件保存`
          : `完了（不足）：${done}/${total} 件。条件を厳格に満たす候補が不足しました。`
      );
    } catch (e: any) {
      setActiveIdx(-1);
      setS((arr) => arr.map((v) => (v === "running" ? "error" : v)));
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const manualAdd = async (c: RejectedRow) => {
    if (!tenantId) return;
    try {
      const r = await fetch("/api/form-outreach/companies/fetch", {
        method: "PATCH",
        headers: {
          "x-tenant-id": tenantId,
          "content-type": "application/json",
        },
        body: JSON.stringify({ candidate: c }),
      });
      const j = await safeJson(r);
      if (!r.ok) throw new Error(j?.error || "manual add failed");
      setAdded((prev) => (j?.row ? [j.row, ...prev] : prev));
      setMsg("1件を手動追加しました。");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const cancelAdditions = async () => {
    if (!tenantId || added.length === 0) return;
    if (!confirm("今回追加分をすべて取り消して削除します。よろしいですか？"))
      return;
    try {
      const ids = added.map((r) => r.id);
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

  /** --- サマリー（「規模」の前と「資本金」の前で改行） --- */
  const summaryParts = useMemo(() => {
    const pref = filters.prefectures.length
      ? filters.prefectures.join(" / ")
      : "全国";
    const size = filters.employee_size_ranges.length
      ? filters.employee_size_ranges.join(" / ")
      : "指定なし";
    const capital =
      (Number.isFinite(filters.capital_min)
        ? formatYen(filters.capital_min!)
        : "-") +
      " 〜 " +
      (Number.isFinite(filters.capital_max)
        ? formatYen(filters.capital_max!)
        : "-");
    const established =
      (filters.established_from || "-") +
      " 〜 " +
      (filters.established_to || "-");
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
    return { pref, size, capital, established, kw, ind };
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
              進行をフローチャートで可視化。保存は逐次反映。紺色バッジは非表示。
            </p>
            {/* ★ 改行位置を調整（規模の前 / 資本金の前で改行） */}
            <p className="text-xs text-neutral-500 mt-1 break-words whitespace-pre-wrap">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span>
              {"\n"}現在のフィルタ: 都道府県={summaryParts.pref}
              {"\n"}規模={summaryParts.size}
              {"\n"}資本金={summaryParts.capital}
              {"\n"}設立={summaryParts.established}
              {"\n"}KW={summaryParts.kw}
              {"\n"}業種={summaryParts.ind}
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

        {/* 逐次レンダリングテーブル（適合） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              今回追加（新しい順）
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

          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">企業名</th>
                <th className="px-3 py-3 text-left">サイトURL</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">フォーム</th>
                <th className="px-3 py-3 text-left">規模</th>
                <th className="px-3 py-3 text-left">都道府県</th>
                <th className="px-3 py-3 text-left">業種</th>
                <th className="px-3 py-3 text-left">資本金</th>
                <th className="px-3 py-3 text-left">設立</th>
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
                    {c.capital != null ? formatYen(c.capital) : "-"}
                  </td>
                  <td className="px-3 py-2">{c.established_on || "-"}</td>
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
                    colSpan={11}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    新規追加はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* ★ 不適合（フィルタで弾いた）一覧 + 手動追加 */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              フィルタ不適合（手動判断で追加可能）
            </div>
            <div className="text-xs text-neutral-500">最大1000件まで保持</div>
          </div>

          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">企業名</th>
                <th className="px-3 py-3 text-left">サイトURL</th>
                <th className="px-3 py-3 text-left">都道府県</th>
                <th className="px-3 py-3 text-left">資本金</th>
                <th className="px-3 py-3 text-left">設立</th>
                <th className="px-3 py-3 text-left">理由</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rejected.map((c, idx) => (
                <tr key={`${c.company_name}-${idx}`}>
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
                  <td className="px-3 py-2">
                    {Array.isArray(c.prefectures) && c.prefectures.length
                      ? c.prefectures.join(" / ")
                      : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {c.capital != null ? formatYen(c.capital) : "-"}
                  </td>
                  <td className="px-3 py-2">{c.established_on || "-"}</td>
                  <td className="px-3 py-2">
                    {(c.reject_reasons || []).slice(0, 4).join(" / ") || "-"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => manualAdd(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                      title="手動で追加"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      追加
                    </button>
                  </td>
                </tr>
              ))}
              {rejected.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    不適合の候補はありません
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

/** ===== helpers ===== */
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
function formatYen(n: number) {
  if (n >= 100_000_000 && n % 100_000_000 === 0)
    return `${n / 100_000_000}億円`;
  if (n >= 10_000 && n % 10_000 === 0) return `${n / 10_000}万円`;
  return `${n.toLocaleString()}円`;
}

/** API待機中に指定区間を順に running→done で進める簡易アニメーション */
function animateSteps(
  setS: React.Dispatch<React.SetStateAction<StepState[]>>,
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>,
  range: { start: number; end: number }
) {
  let stopped = false;
  (async () => {
    for (let i = range.start; i <= range.end; i++) {
      if (stopped) break;
      setActiveIdx(i);
      setS((a) =>
        a.map((v, idx) =>
          idx === i ? "running" : idx < i && v === "idle" ? "done" : v
        )
      );
      await delay(220);
      if (stopped) break;
      setS((a) => a.map((v, idx) => (idx === i ? "done" : v)));
    }
  })();
  return {
    stop: () => {
      stopped = true;
      setActiveIdx(-1);
    },
  };
}
