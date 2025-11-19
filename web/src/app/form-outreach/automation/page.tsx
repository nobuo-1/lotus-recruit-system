// web/src/app/form-outreach/automation/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Settings = {
  auto_company_list: boolean;
  auto_send_messages: boolean;
  dual_channel_priority: "form" | "email";
  company_schedule: "weekly" | "monthly";
  company_weekday?: number;
  company_month_day?: number;
  company_limit?: number;
  confirm_by_email?: boolean;
  confirm_email_address?: string;
  updated_at?: string | null;
};

type ConflictRow = {
  id: string;
  client_name: string | null;
  company_name: string | null;
  website: string | null;
  detected_at: string | null;
};

type AutomationProgress = {
  status?: "idle" | "running" | "completed" | "error";
  label?: string | null;
  last_run_started_at?: string | null;
  last_run_finished_at?: string | null;
  today_target_count?: number | null;
  today_processed_count?: number | null;

  // ▼ 追加: 今日の新規件数（正規 / 不備 / 近似サイト）
  today_new_prospects?: number | null;
  today_new_rejected?: number | null;
  today_new_similar_sites?: number | null;

  queue_size?: number | null;
  error_message?: string | null;
};

/** Cookie から tenant_id を取得（x-tenant-id 優先） */
function getTenantIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const m =
      document.cookie.match(/(?:^|;\s*)x-tenant-id=([^;]+)/) ||
      document.cookie.match(/(?:^|;\s*)tenant_id=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export default function AutomationPage() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [tenantId, setTenantId] = useState<string | null>(null);

  // 画面表示用の「現在設定」
  const [settings, setSettings] = useState<Settings>({
    auto_company_list: false,
    auto_send_messages: false,
    dual_channel_priority: "form",
    company_schedule: "weekly",
    company_weekday: 1,
    company_month_day: 1,
    company_limit: 100,
    confirm_by_email: false,
    confirm_email_address: "",
    updated_at: null,
  });

  // モーダル内の編集用（開いた時に現設定をコピー）
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<Settings>(settings);

  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);

  // 自動実行の進捗
  const [progress, setProgress] = useState<AutomationProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  // ▼ テナントID取得
  useEffect(() => {
    const tid = getTenantIdFromCookie();
    if (!tid) {
      setMsg(
        "テナントID（UUID）が見つかりません。ログイン後、または x-tenant-id クッキー/ヘッダを設定してください。"
      );
      return;
    }
    setTenantId(tid);
  }, []);

  // ▼ 設定・被り候補のロード（テナントIDが取れてから）
  useEffect(() => {
    if (!tenantId) return;

    const load = async () => {
      setMsg("");
      try {
        const res = await fetch("/api/form-outreach/automation/settings", {
          headers: { "x-tenant-id": tenantId },
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          const s = (j?.settings ?? j) as Partial<Settings>;
          const updated =
            (j as any)?.updatedAt ||
            (j as any)?.updated_at ||
            s.updated_at ||
            null;
          setSettings((prev) => ({ ...prev, ...s, updated_at: updated }));
          setDraft((prev) => ({ ...prev, ...s, updated_at: updated }));
        }

        const rc = await fetch("/api/form-outreach/conflicts", {
          headers: { "x-tenant-id": tenantId },
          cache: "no-store",
        });
        if (rc.ok) {
          const jc = await rc.json();
          setConflicts(jc.rows ?? []);
        } else {
          setConflicts([]);
        }
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    };

    load();
  }, [tenantId]);

  // ▼ 自動実行の進捗ロード & ポーリング
  useEffect(() => {
    if (!tenantId) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const fetchProgress = async () => {
      try {
        setProgressLoading(true);

        // ★ 1) まずサーバー側の自動実行トリガーを叩く
        //    - run-company-list 側で「週次 / 月次」「取得件数上限」「filters」を判定してくれる
        //    - 条件を満たさないときは skipped:true で軽く返るだけ
        try {
          await fetch("/api/form-outreach/automation/run-company-list", {
            method: "POST",
            headers: {
              "x-tenant-id": tenantId,
              "content-type": "application/json",
            },
            body: JSON.stringify({ triggered_by: "progress" }),
          });
        } catch (e) {
          console.error("auto run trigger failed:", e);
        }

        // ★ 2) その後で最新の進捗を取得
        const res = await fetch("/api/form-outreach/automation/progress", {
          headers: { "x-tenant-id": tenantId },
          cache: "no-store",
        });

        if (!res.ok) {
          // 404などの場合は進捗表示を非表示にするだけ
          setProgress(null);
          return;
        }

        const j = await res.json().catch(() => ({}));
        const p = (j?.progress ?? j) as Partial<AutomationProgress>;

        setProgress((prev) => ({
          status: p.status ?? prev?.status ?? "idle",
          label: p.label ?? prev?.label ?? null,
          last_run_started_at:
            p.last_run_started_at ?? prev?.last_run_started_at ?? null,
          last_run_finished_at:
            p.last_run_finished_at ?? prev?.last_run_finished_at ?? null,
          today_target_count:
            p.today_target_count ?? prev?.today_target_count ?? null,
          today_processed_count:
            p.today_processed_count ?? prev?.today_processed_count ?? null,

          // ▼ 追加: 正規 / 不備 / 近似サイト
          today_new_prospects:
            p.today_new_prospects ?? prev?.today_new_prospects ?? null,
          today_new_rejected:
            p.today_new_rejected ?? prev?.today_new_rejected ?? null,
          today_new_similar_sites:
            p.today_new_similar_sites ?? prev?.today_new_similar_sites ?? null,

          queue_size: p.queue_size ?? prev?.queue_size ?? null,
          error_message: p.error_message ?? prev?.error_message ?? null,
        }));
      } catch (e) {
        console.error("Failed to load automation progress:", e);
      } finally {
        setProgressLoading(false);
      }
    };

    fetchProgress();
    timer = setInterval(fetchProgress, 10_000); // 10秒ごとに更新

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tenantId]);

  const openModal = () => {
    setDraft(settings); // 現在設定を引き継ぐ
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);

  const save = async () => {
    if (loading) return;
    if (!tenantId) {
      setMsg(
        "テナントIDが取得できませんでした。ログイン状態や x-tenant-id クッキーを確認してください。"
      );
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/automation/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({ settings: draft }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error || "save failed");

      const updated: string =
        (j as any)?.updatedAt ||
        (j as any)?.updated_at ||
        new Date().toISOString();

      // 画面の現在設定を更新（即時反映）
      setSettings({ ...draft, updated_at: updated });
      setMsg(`更新しました（${formatTsJST(updated)}）`);

      // モーダルを自動で閉じる
      setModalOpen(false);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const summaryChips = useMemo(() => {
    const chips: string[] = [];
    if (settings.auto_company_list) {
      if (settings.company_schedule === "weekly") {
        chips.push(
          `法人リスト: 週次（${weekdayLabel(settings.company_weekday)}）`
        );
      } else {
        chips.push(`法人リスト: 月次（毎月${settings.company_month_day}日）`);
      }
      chips.push(`取得件数: ${settings.company_limit ?? "-"}件`);
    } else {
      chips.push("法人リスト: 自動化しない");
    }
    if (settings.auto_send_messages) {
      chips.push(
        `送信: 自動（優先=${
          settings.dual_channel_priority === "form" ? "フォーム" : "メール"
        }）`
      );
      chips.push(
        settings.confirm_by_email
          ? `承認: メール確認（${settings.confirm_email_address || "-"}）`
          : "承認: なし（即時実行）"
      );
    } else {
      chips.push("送信: 自動化しない");
    }
    return chips;
  }, [settings]);

  const summaryInline = useMemo(() => {
    const parts: string[] = [];
    if (settings.auto_company_list) {
      parts.push(
        settings.company_schedule === "weekly"
          ? `法人リスト=週次(${weekdayLabel(settings.company_weekday)})`
          : `法人リスト=月次(毎${settings.company_month_day}日)`
      );
      parts.push(`件数=${settings.company_limit ?? "-"}`);
    } else {
      parts.push("法人リスト=自動化なし");
    }
    if (settings.auto_send_messages) {
      parts.push(
        `送信=自動(優先=${
          settings.dual_channel_priority === "form" ? "フォーム" : "メール"
        })`
      );
      parts.push(
        settings.confirm_by_email
          ? `承認=メール(${settings.confirm_email_address || "-"})`
          : "承認=なし"
      );
    } else {
      parts.push("送信=自動化なし");
    }
    return parts.join(" / ");
  }, [settings]);

  const progressPercent = useMemo(() => {
    if (
      !progress ||
      progress.today_target_count == null ||
      progress.today_target_count <= 0 ||
      progress.today_processed_count == null
    ) {
      return null;
    }
    const p =
      (progress.today_processed_count / progress.today_target_count) * 100;
    return Math.max(0, Math.min(100, Math.round(p)));
  }, [progress]);

  const statusLabel = useMemo(() => {
    if (!progress || !progress.status) return "状態: 不明";
    switch (progress.status) {
      case "idle":
        return "状態: 待機中";
      case "running":
        return "状態: 実行中";
      case "completed":
        return "状態: 完了";
      case "error":
        return "状態: エラー";
      default:
        return `状態: ${progress.status}`;
    }
  }, [progress]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-neutral-900">
                自動実行設定
              </h1>
              <p className="mt-1 text-xs text-neutral-500">
                最終更新：{formatTsJST(settings.updated_at)}
              </p>
            </div>
            <div className="shrink-0">
              <button
                onClick={openModal}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                設定変更
              </button>
            </div>
          </div>

          {/* 現在設定の強調カード */}
          <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">
            <div className="mb-2 text-sm font-medium text-neutral-800">
              現在の設定
            </div>
            <div className="flex flex-wrap gap-2">
              {summaryChips.map((chip, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm"
                >
                  {chip}
                </span>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-neutral-500">
              {summaryInline}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <BlockA settings={settings} />
              <BlockB settings={settings} />
            </div>
          </div>
        </div>

        {/* 自動実行の進捗カード */}
        {tenantId && (
          <section className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-neutral-800">
                  自動実行の進捗
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  今日分の自動処理の進み具合を表示します。
                </p>
              </div>
              {progressLoading && (
                <span className="text-[11px] text-neutral-400">更新中…</span>
              )}
            </div>

            {progress ? (
              <div className="mt-3 space-y-4">
                {/* 進捗バー（正規企業リスト基準） */}
                {progressPercent != null ? (
                  <div>
                    <div className="mb-1 flex items-center justify_between text-xs text-neutral-600">
                      <span>{statusLabel}</span>
                      <span>
                        {progress.today_processed_count ?? 0} /{" "}
                        {progress.today_target_count ?? 0} 件
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-2 rounded-full bg-indigo-500 transition-[width]"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-[11px] text-neutral-500">
                      {progressPercent}% 完了
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-neutral-500">
                    {statusLabel}
                    {progress.label ? `（${progress.label}）` : ""}
                  </div>
                )}

                {/* 正規 / 不備 / 近似サイト のサマリカード */}
                <div className="grid grid-cols-1 gap-3 text-[11px] text-neutral-700 md:grid-cols-3">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                    <div className="text-[11px] font-medium text-emerald-800">
                      正規企業リスト（新規）
                    </div>
                    <div className="mt-1 text-lg font-semibold text-emerald-900">
                      {progress.today_new_prospects ?? 0} 件
                    </div>
                    <p className="mt-0.5 text-[10px] text-emerald-800/80">
                      今日、自動処理で <code>form_prospects</code>{" "}
                      に追加された件数
                    </p>
                  </div>

                  <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
                    <div className="text-[11px] font-medium text-amber-800">
                      不備企業リスト（除外）
                    </div>
                    <div className="mt-1 text-lg font-semibold text-amber-900">
                      {progress.today_new_rejected ?? 0} 件
                    </div>
                    <p className="mt-0.5 text-[10px] text-amber-800/80">
                      今日、条件不一致などで{" "}
                      <code>form_prospects_rejected</code> に入った件数
                    </p>
                  </div>

                  <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2">
                    <div className="text-[11px] font-medium text-sky-800">
                      近似サイトリスト（要確認）
                    </div>
                    <div className="mt-1 text-lg font-semibold text-sky-900">
                      {progress.today_new_similar_sites ?? 0} 件
                    </div>
                    <p className="mt-0.5 text-[10px] text-sky-800/80">
                      今日、<code>form_similar_sites</code> に保存された件数
                    </p>
                  </div>
                </div>

                {/* 実行時間などの詳細 */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-neutral-600 md:grid-cols-4">
                  <div>
                    <dt className="text-neutral-400">最終実行開始</dt>
                    <dd>{formatTsJST(progress.last_run_started_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">最終実行終了</dt>
                    <dd>{formatTsJST(progress.last_run_finished_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">今日の対象件数</dt>
                    <dd>
                      {progress.today_target_count != null
                        ? `${progress.today_target_count} 件`
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">今日の処理済み件数</dt>
                    <dd>
                      {progress.today_processed_count != null
                        ? `${progress.today_processed_count} 件`
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">キューの残り</dt>
                    <dd>
                      {progress.queue_size != null
                        ? `${progress.queue_size} 件`
                        : "-"}
                    </dd>
                  </div>
                </dl>

                {progress.error_message && (
                  <div className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                    <div className="font-medium">エラー情報</div>
                    <div className="mt-0.5 whitespace-pre-wrap">
                      {progress.error_message}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 text-xs text-neutral-500">
                まだ自動実行の履歴がないか、進捗情報の取得ができていません。
                バックエンド側で
                <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 text-[10px]">
                  /api/form-outreach/automation/progress
                </code>
                のエンドポイントを実装してください。
              </div>
            )}
          </section>
        )}

        {/* 被り候補 */}
        <section className="overflow-hidden rounded-2xl border border-neutral-200">
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-800">
            クライアントと被っている可能性のある企業
          </div>
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">クライアント</th>
                <th className="px-3 py-3 text-left">企業名</th>
                <th className="px-3 py-3 text-left">サイトURL</th>
                <th className="px-3 py-3 text-left">検出日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {conflicts.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.client_name || "-"}</td>
                  <td className="px-3 py-2">{c.company_name || "-"}</td>
                  <td className="px-3 py-2">
                    {c.website ? (
                      <a
                        href={c.website}
                        target="_blank"
                        className="break-all text-indigo-700 hover:underline"
                      >
                        {c.website}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">{formatTsJST(c.detected_at)}</td>
                </tr>
              ))}
              {conflicts.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    現在、重複候補はありません
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

      {/* ▼ 設定変更モーダル（現設定を引き継いで編集） */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold text-neutral-800">
                自動実行設定の変更
              </div>
              <button
                onClick={closeModal}
                className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
              >
                閉じる
              </button>
            </div>

            {/* 設定フォーム */}
            <section className="rounded-xl border border-neutral-200 p-3">
              {/* 法人リスト自動化 */}
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm text-neutral-800">
                  <input
                    type="checkbox"
                    checked={draft.auto_company_list}
                    onChange={(e) =>
                      setDraft((s) => ({
                        ...s,
                        auto_company_list: e.target.checked,
                      }))
                    }
                  />
                  法人リストの作成を自動で行う
                </label>

                {draft.auto_company_list && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div>
                      <div className="mb-1 text-xs text-neutral-600">頻度</div>
                      <select
                        className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                        value={draft.company_schedule}
                        onChange={(e) =>
                          setDraft((s) => ({
                            ...s,
                            company_schedule: e.target.value as
                              | "weekly"
                              | "monthly",
                          }))
                        }
                      >
                        <option value="weekly">週次</option>
                        <option value="monthly">月次</option>
                      </select>
                    </div>

                    {draft.company_schedule === "weekly" ? (
                      <div>
                        <div className="mb-1 text-xs text-neutral-600">
                          実行曜日
                        </div>
                        <select
                          className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                          value={draft.company_weekday ?? 1}
                          onChange={(e) =>
                            setDraft((s) => ({
                              ...s,
                              company_weekday: Number(e.target.value),
                            }))
                          }
                        >
                          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                            <option key={d} value={d}>
                              {weekdayLabel(d)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-1 text-xs text-neutral-600">
                          実行日
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          value={draft.company_month_day ?? 1}
                          onChange={(e) =>
                            setDraft((s) => ({
                              ...s,
                              company_month_day: clampInt(
                                e.target.value,
                                1,
                                31
                              ),
                            }))
                          }
                        />
                      </div>
                    )}

                    <div>
                      <div className="mb-1 text-xs text-neutral-600">
                        取得件数
                      </div>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        value={draft.company_limit ?? 100}
                        onChange={(e) =>
                          setDraft((s) => ({
                            ...s,
                            company_limit: clampInt(e.target.value, 1, 100000),
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <hr className="my-4 border-neutral-200" />

              {/* メッセージ送信自動化 */}
              <div className="mb-2">
                <label className="flex items-center gap-2 text-sm text-neutral-800">
                  <input
                    type="checkbox"
                    checked={draft.auto_send_messages}
                    onChange={(e) =>
                      setDraft((s) => ({
                        ...s,
                        auto_send_messages: e.target.checked,
                      }))
                    }
                  />
                  メッセージの送信を自動で行う
                </label>

                {draft.auto_send_messages && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <div className="mb-1 text-xs text-neutral-600">
                        優先チャンネル
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="prio"
                            checked={draft.dual_channel_priority === "form"}
                            onChange={() =>
                              setDraft((s) => ({
                                ...s,
                                dual_channel_priority: "form",
                              }))
                            }
                          />
                          フォーム
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="prio"
                            checked={draft.dual_channel_priority === "email"}
                            onChange={() =>
                              setDraft((s) => ({
                                ...s,
                                dual_channel_priority: "email",
                              }))
                            }
                          />
                          メール
                        </label>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs text-neutral-600">
                        送信前確認
                      </div>
                      <label className="flex items-center gap-2 text-sm text-neutral-800">
                        <input
                          type="checkbox"
                          checked={!!draft.confirm_by_email}
                          onChange={(e) =>
                            setDraft((s) => ({
                              ...s,
                              confirm_by_email: e.target.checked,
                            }))
                          }
                        />
                        メールで承認する
                      </label>
                    </div>

                    {draft.confirm_by_email && (
                      <div>
                        <div className="mb-1 text-xs text-neutral-600">
                          確認用メールアドレス
                        </div>
                        <input
                          type="email"
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          placeholder="example@yourdomain.jp"
                          value={draft.confirm_email_address ?? ""}
                          onChange={(e) =>
                            setDraft((s) => ({
                              ...s,
                              confirm_email_address: e.target.value.trim(),
                            }))
                          }
                        />
                        <p className="mt-1 text-[11px] text-neutral-500">
                          送信予定リストがこのアドレスへ届き、メール上の「実行」ボタン押下で送信されます。
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                キャンセル
              </button>
              <button
                onClick={save}
                disabled={loading}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                {loading ? "保存中…" : "保存する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BlockA({ settings }: { settings: Settings }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="mb-1 text-sm font-semibold text-neutral-800">
        法人リスト自動化
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs text-neutral-700">
        <dt className="col-span-1 text-neutral-500">状態</dt>
        <dd className="col-span-2">
          {settings.auto_company_list ? "自動化オン" : "自動化なし"}
        </dd>

        <dt className="col-span-1 text-neutral-500">スケジュール</dt>
        <dd className="col-span-2">
          {settings.company_schedule === "weekly"
            ? `週次（${weekdayLabel(settings.company_weekday)}）`
            : `月次（毎月${settings.company_month_day}日）`}
        </dd>

        <dt className="col-span-1 text-neutral-500">取得件数</dt>
        <dd className="col-span-2">{settings.company_limit ?? "-"}</dd>
      </dl>
    </div>
  );
}

function BlockB({ settings }: { settings: Settings }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow_sm">
      <div className="mb-1 text-sm font-semibold text-neutral-800">
        メッセージ送信自動化
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs text-neutral-700">
        <dt className="col-span-1 text-neutral-500">状態</dt>
        <dd className="col-span-2">
          {settings.auto_send_messages ? "自動化オン" : "自動化なし"}
        </dd>

        <dt className="col-span-1 text-neutral-500">優先</dt>
        <dd className="col-span-2">
          {settings.dual_channel_priority === "form" ? "フォーム" : "メール"}
        </dd>

        <dt className="col-span-1 text-neutral-500">承認</dt>
        <dd className="col-span-2">
          {settings.confirm_by_email
            ? `メール確認（${settings.confirm_email_address || "-"}）`
            : "なし（即時実行）"}
        </dd>
      </dl>
    </div>
  );
}

function weekdayLabel(d?: number) {
  const map: Record<number, string> = {
    1: "毎週月曜",
    2: "毎週火曜",
    3: "毎週水曜",
    4: "毎週木曜",
    5: "毎週金曜",
    6: "毎週土曜",
    7: "毎週日曜",
  };
  return d && map[d] ? map[d] : "毎週月曜";
}

// JST(日本時間)で「2025年11月17日 14:18」形式で表示
function formatTsJST(ts?: string | null) {
  if (!ts) return "-";
  const d = new Date(ts);

  const opt: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  // 例: "2025/11/17 14:03"
  const formatted = d.toLocaleString("ja-JP", opt);
  const [ymd, hm] = formatted.split(" ");
  if (!ymd || !hm) return formatted;

  const [y, m, day] = ymd.split("/");
  return `${y}年${m}月${day}日 ${hm}`;
}

function clampInt(v: string, min: number, max: number) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
