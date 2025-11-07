// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, Play } from "lucide-react";

const LS_KEY = "fo_manual_fetch_latest";
const LS_FETCH_COUNT = "fo_manual_fetch_count";
const LS_REJECT_KEY = "fo_manual_fetch_rejected";

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

type RejectedRow = {
  company_name: string;
  website?: string | null;
  contact_email?: string | null;
  contact_form_url?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  company_size?: string | null;
  company_size_extracted?: string | null;
  prefectures?: string[] | null;
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
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
  // 新規レンジ系
  capital_min?: number | null;
  capital_max?: number | null;
  established_from?: string | null; // YYYY-MM-DD
  established_to?: string | null; // YYYY-MM-DD
  updated_at?: string | null;
};

// フロー可視化（任意に増減）
const FLOW_TITLES = [
  "条件読み込み/表示",
  "国税庁から候補抽出（ランダム地域）",
  "登記付与（資本金・設立）",
  "事前フィルタ（資本金/設立）",
  "公式HP解決（LLM）",
  "到達性チェック（HTTP）",
  "メール/フォーム抽出",
  "従業員規模推定",
  "都道府県/業種推定",
  "保存（DB）/ 不適合集計",
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
  const cancelledRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        // me
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

        // keep "added"
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const obj = JSON.parse(raw);
          const ts = obj?.ts ? new Date(obj.ts).getTime() : 0;
          if (Date.now() - ts < 24 * 3600 * 1000) setAdded(obj.rows ?? []);
          else localStorage.removeItem(LS_KEY);
        }
        // keep "rejected"
        const rejRaw = localStorage.getItem(LS_REJECT_KEY);
        if (rejRaw) {
          const obj = JSON.parse(rejRaw);
          const ts = obj?.ts ? new Date(obj.ts).getTime() : 0;
          if (Date.now() - ts < 24 * 3600 * 1000)
            setRejected(Array.isArray(obj.rows) ? obj.rows : []);
          else localStorage.removeItem(LS_REJECT_KEY);
        }

        const last = Number(localStorage.getItem(LS_FETCH_COUNT));
        if (Number.isFinite(last) && last > 0)
          setFetchTotal(Math.max(10, Math.min(2000, last)));
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const anyRunning = loading; // シンプルに実行状態で判定

  /** 実行/中止ボタンのクリック */
  const handleRunButton = () => {
    if (anyRunning) {
      // 中止
      cancelledRef.current = true;
      abortRef.current?.abort();
      setMsg("実行を中止しています…");
      return;
    }
    // 実行開始（件数モーダル）
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
    cancelledRef.current = false;
    setS(Array(FLOW_TITLES.length).fill("idle"));
    setActiveIdx(-1);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      // 0: 条件表示（固定）
      setActiveIdx(0);
      setS((a) => a.map((v, i) => (i === 0 ? "running" : "idle")));
      await delay(180);
      setS((a) => a.map((v, i) => (i === 0 ? "done" : v)));
      setActiveIdx(-1);

      let done = 0;
      let attempts = 0;
      const MAX_ATTEMPTS = Math.ceil(total / 5) + 10; // 充分な再試行枠
      const BATCH = Math.min(25, Math.max(8, Math.floor(total / 4))); // 自動バッチ

      while (done < total && attempts < MAX_ATTEMPTS) {
        if (cancelledRef.current) throw new Error("ABORTED");
        attempts++;
        const want = Math.min(BATCH, total - done);
        const seed = `${Date.now()}-${attempts}`;

        // フローの擬似進行（API待ちの間、1→FLOW_TITLES.length-2 を順回し）
        const anim = animateSteps(setS, setActiveIdx, FLOW_TITLES.length);

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

        // 保存（末尾ステップ）を明示
        anim.stop();
        const lastIdx = FLOW_TITLES.length - 1;
        setActiveIdx(lastIdx);
        setS((a) =>
          a.map((v, i) =>
            i === lastIdx
              ? "running"
              : i < lastIdx
              ? a[i] === "idle"
                ? "done"
                : a[i]
              : v
          )
        );
        await delay(120);

        if (!r.ok) {
          if (cancelledRef.current) throw new Error("ABORTED");
          throw new Error(j?.error || `fetch failed (${r.status})`);
        }

        const rows = j.rows ?? [];
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
        if (Array.isArray(j.rejected) && j.rejected.length) {
          const rejList: RejectedRow[] = j.rejected as RejectedRow[];
          setRejected((prev) => {
            const next = dedupeRejected([...rejList, ...prev]);
            localStorage.setItem(
              LS_REJECT_KEY,
              JSON.stringify({ ts: new Date().toISOString(), rows: next })
            );
            return next;
          });
        }

        const inc = Number.isFinite(j.inserted)
          ? Number(j.inserted)
          : rows.length;
        done += inc;

        setS((a) => a.map((v, i) => (i === lastIdx ? "done" : v)));
        setActiveIdx(-1);
        setMsg(`取得進行中：${done}/${total} 件`);

        if (inc === 0) {
          await delay(240);
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
      if (String(e?.message || e) === "ABORTED") {
        setMsg("実行を中止しました。");
      } else {
        setMsg(String(e?.message || e));
      }
    } finally {
      setLoading(false);
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

  /** 不適合 → 採用に追加（手動） */
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

      // 追加先の一覧に反映
      if (j?.row) {
        setAdded((prev) => {
          const next = [j.row as AddedRow, ...prev];
          localStorage.setItem(
            LS_KEY,
            JSON.stringify({ ts: new Date().toISOString(), rows: next })
          );
          return next;
        });
      }
      // 不適合からは除去
      setRejected((prev) => {
        const next = prev.filter((x) => !sameRejected(x, row));
        localStorage.setItem(
          LS_REJECT_KEY,
          JSON.stringify({ ts: new Date().toISOString(), rows: next })
        );
        return next;
      });
      setMsg("不適合から採用に追加しました。");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  /** 不適合の一時非表示 */
  const hideRejected = (row: RejectedRow) => {
    setRejected((prev) => {
      const next = prev.filter((x) => !sameRejected(x, row));
      localStorage.setItem(
        LS_REJECT_KEY,
        JSON.stringify({ ts: new Date().toISOString(), rows: next })
      );
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
            <p className="text-xs text-neutral-500 mt-1 break-words">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span>
              <br />
              現在のフィルタ:{" "}
              <span className="opacity-80">都道府県={summaryParts.pref}</span>
              <br />
              <span className="opacity-80">
                {/* ご要望: 「規模」の前で改行 */}
                規模={summaryParts.size}
              </span>
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
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
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

        {/* 逐次レンダリングテーブル（今回追加） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
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

          <div className="overflow-x-auto">
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
                  <th className="px-3 py-3 text-left">法人番号</th>
                  <th className="px-3 py-3 text-left">本社所在地</th>
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
                      {c.capital != null ? formatJPY(c.capital) : "-"}
                    </td>
                    <td className="px-3 py-2">{c.established_on || "-"}</td>
                    <td className="px-3 py-2">{c.corporate_number || "-"}</td>
                    <td className="px-3 py-2 break-all">
                      {c.hq_address || "-"}
                    </td>
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
                      colSpan={13}
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

        {/* フィルタ不適合（横スクロール対応 + 手動追加） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden mt-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="text-sm font-medium text-neutral-800">
              フィルタ不適合（重複除去済み / 直近取得が上）
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              表示件数: {rejected.length}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1400px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">企業名</th>
                  <th className="px-3 py-3 text-left">サイトURL</th>
                  <th className="px-3 py-3 text-left">都道府県</th>
                  <th className="px-3 py-3 text-left">資本金</th>
                  <th className="px-3 py-3 text-left">設立</th>
                  <th className="px-3 py-3 text-left">法人番号</th>
                  <th className="px-3 py-3 text-left">本社所在地</th>
                  <th className="px-3 py-3 text-left">メール</th>
                  <th className="px-3 py-3 text-left">フォーム</th>
                  <th className="px-3 py-3 text-left">推定規模</th>
                  <th className="px-3 py-3 text-left">業種</th>
                  <th className="px-3 py-3 text-left">不採用理由</th>
                  <th className="px-3 py-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rejected.map((r, idx) => (
                  <tr key={idx}>
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
                      {r.capital != null ? formatJPY(r.capital) : "-"}
                    </td>
                    <td className="px-3 py-2">{r.established_on || "-"}</td>
                    <td className="px-3 py-2">{r.corporate_number || "-"}</td>
                    <td className="px-3 py-2 break-all">
                      {r.hq_address || "-"}
                    </td>
                    <td className="px-3 py-2">{r.contact_email || "-"}</td>
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
                          (rr, i) => (
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

/** API待機中に 1→(FLOW_TITLES.length-2) を順に running→done で進める簡易アニメーション */
function animateSteps(
  setS: React.Dispatch<React.SetStateAction<StepState[]>>,
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>,
  totalSteps: number
) {
  let stopped = false;
  (async () => {
    for (let i = 1; i <= Math.max(1, totalSteps - 2); i++) {
      if (stopped) break;
      setActiveIdx(i);
      setS((a) =>
        a.map((v, idx) =>
          idx === i ? "running" : idx < i && v === "idle" ? "done" : v
        )
      );
      await delay(180);
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
      // 不採用理由はマージ
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
