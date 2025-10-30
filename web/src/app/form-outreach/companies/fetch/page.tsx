// web/src/app/form-outreach/companies/fetch/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, Play } from "lucide-react";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";
const LS_KEY = "fo_manual_fetch_latest"; // 1日キャッシュ

type StepState = "idle" | "running" | "done" | "error";

type AddedRow = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  source_site: string | null;
  created_at: string | null;
};

type RunResult = {
  inserted?: number;
  rows?: AddedRow[];
  error?: string;
};

export default function ManualFetch() {
  const [msg, setMsg] = useState("");
  const [s1, setS1] = useState<StepState>("idle"); // 収集
  const [s2, setS2] = useState<StepState>("idle"); // 解析
  const [s3, setS3] = useState<StepState>("idle"); // 保存

  const [added, setAdded] = useState<AddedRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 1日だけ保持した結果を表示
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      const ts = obj?.ts ? new Date(obj.ts).getTime() : 0;
      if (Date.now() - ts < 24 * 60 * 60 * 1000) {
        setAdded(obj.rows ?? []);
      } else {
        localStorage.removeItem(LS_KEY);
      }
    } catch {}
  }, []);

  const anyRunning = s1 === "running" || s2 === "running" || s3 === "running";

  const run = async () => {
    if (anyRunning || loading) return;
    setMsg("");
    setLoading(true);
    setS1("running");
    setS2("idle");
    setS3("idle");
    setAdded([]);

    try {
      // ステップ1: 収集
      await wait(400); // UX用の最小待機
      // 実処理は fetch-now に集約
      // ステップ2: 解析（見せ方上で遷移）
      setS1("done");
      setS2("running");
      await wait(200);

      // ステップ3: 保存
      setS2("done");
      setS3("running");

      const r = await fetch("/api/form-outreach/companies/fetch-now", {
        method: "POST",
        headers: {
          "x-tenant-id": TENANT_ID,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenant_id: TENANT_ID }),
      });
      const j: RunResult = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch-now failed");

      setS3("done");
      const rows = j.rows ?? [];
      setAdded(rows);

      // 1日キャッシュ
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ ts: new Date().toISOString(), rows })
      );
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
    if (added.length === 0) return;
    const ids = added.map((r) => r.id);
    try {
      const r = await fetch("/api/form-outreach/companies/cancel-additions", {
        method: "POST",
        headers: {
          "x-tenant-id": TENANT_ID,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "cancel failed");
      setMsg(`取消しました：削除 ${j.deleted ?? 0} 件`);
      setAdded([]);
      localStorage.removeItem(LS_KEY);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

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
            <button
              onClick={run}
              disabled={anyRunning || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {anyRunning || loading ? "実行中…" : "ワークフローを実行"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StepCard title="収集（スクレイピング）" state={s1} />
            <StepCard title="解析（正規化・抽出）" state={s2} />
            <StepCard title="保存（DBへ反映）" state={s3} />
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
                  <td className="px-3 py-2">{c.source_site || "-"}</td>
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

function StepCard({ title, state }: { title: string; state: StepState }) {
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
      <div className="mb-2 text-sm font-semibold text-neutral-800">{title}</div>
      <div className="flex items-center justify-center py-6">{icon}</div>
      <div className="text-center text-xs text-neutral-500">
        {state === "idle" && "待機中"}
        {state === "running" && "実行中…"}
        {state === "done" && "完了"}
        {state === "error" && "失敗"}
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
