// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";

import React, { useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type StepKey = "discover" | "parse" | "dedupe" | "enrich" | "upsert";
type StepState = "idle" | "running" | "done" | "error";

const STEPS: { key: StepKey; label: string; desc: string }[] = [
  { key: "discover", label: "探索", desc: "候補URLの取得・抽出" },
  { key: "parse", label: "解析", desc: "会社名・サイトURLの解析" },
  { key: "dedupe", label: "重複排除", desc: "既存レコードとの重複排除" },
  { key: "enrich", label: "付加情報", desc: "フォーム/メールなどの付加" },
  { key: "upsert", label: "保存", desc: "DBへ保存（INSERT/UPDATE）" },
];

export default function CompaniesFetchPage() {
  const [msg, setMsg] = useState("");
  const [running, setRunning] = useState(false);
  const [states, setStates] = useState<Record<StepKey, StepState>>({
    discover: "idle",
    parse: "idle",
    dedupe: "idle",
    enrich: "idle",
    upsert: "idle",
  });

  // 条件（必要に応じて拡張）
  const [limit, setLimit] = useState<number>(100);
  const [needForm, setNeedForm] = useState<"" | "yes" | "no">("");
  const [needEmail, setNeedEmail] = useState<"" | "yes" | "no">("");
  const [since, setSince] = useState<string>("");

  const run = async () => {
    if (running) return;
    setRunning(true);
    setMsg("");
    setStates({
      discover: "running",
      parse: "idle",
      dedupe: "idle",
      enrich: "idle",
      upsert: "idle",
    });
    try {
      // 実行（サーバ側で順次処理）
      const r = await fetch("/api/form-outreach/companies/fetch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({
          limit,
          needForm,
          needEmail,
          since,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");

      // ステップ状態を結果に合わせて更新
      const ok = (k: StepKey) => !j?.steps?.[k]?.error;
      setStates({
        discover: ok("discover") ? "done" : "error",
        parse: ok("parse") ? "done" : "error",
        dedupe: ok("dedupe") ? "done" : "error",
        enrich: ok("enrich") ? "done" : "error",
        upsert: ok("upsert") ? "done" : "error",
      });

      setMsg(
        `完了: 取得 ${j?.steps?.discover?.found ?? 0} / 保存 ${
          j?.steps?.upsert?.inserted ?? 0
        }（重複 ${j?.steps?.dedupe?.skipped ?? 0}）`
      );
    } catch (e: any) {
      setMsg(String(e?.message || e));
      setStates((s) => ({ ...s, upsert: "error" }));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">
            企業リスト手動取得
          </h1>
          <p className="text-sm text-neutral-500">
            固定ワークフローを可視化。条件を指定して実行すると、各ステップの進捗が表示されます。
          </p>
        </div>

        {/* 条件フォーム */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <div className="mb-1 text-xs text-neutral-600">最大取得件数</div>
              <input
                type="number"
                min={1}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={limit}
                onChange={(e) =>
                  setLimit(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">
                フォームの有無
              </div>
              <select
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                value={needForm}
                onChange={(e) => setNeedForm(e.target.value as any)}
              >
                <option value="">（指定なし）</option>
                <option value="yes">フォームありに限定</option>
                <option value="no">フォーム無しに限定</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">メールの有無</div>
              <select
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                value={needEmail}
                onChange={(e) => setNeedEmail(e.target.value as any)}
              >
                <option value="">（指定なし）</option>
                <option value="yes">メールありに限定</option>
                <option value="no">メール無しに限定</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">
                対象とする最古日時（任意）
              </div>
              <input
                type="date"
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                value={since}
                onChange={(e) => setSince(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ステップ可視化 */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-base font-semibold text-neutral-800">
              ワークフロー
            </div>
            <button
              onClick={run}
              disabled={running}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {running ? "実行中…" : "実行する"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {STEPS.map((s) => {
              const st = states[s.key];
              const color =
                st === "done"
                  ? "border-emerald-200 bg-emerald-50"
                  : st === "running"
                  ? "border-indigo-200 bg-indigo-50"
                  : st === "error"
                  ? "border-rose-200 bg-rose-50"
                  : "border-neutral-200 bg-white";
              return (
                <div
                  key={s.key}
                  className={`rounded-xl border ${color} p-3 shadow-sm transition`}
                >
                  <div className="mb-1 text-sm font-semibold text-neutral-800">
                    {s.label}
                  </div>
                  <div className="text-xs text-neutral-600">{s.desc}</div>
                  <div className="mt-2 text-[11px]">
                    状態：
                    {st === "idle" && (
                      <span className="text-neutral-500">待機</span>
                    )}
                    {st === "running" && (
                      <span className="text-indigo-700">実行中…</span>
                    )}
                    {st === "done" && (
                      <span className="text-emerald-700">完了</span>
                    )}
                    {st === "error" && (
                      <span className="text-rose-700">エラー</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-700">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
