// web/src/app/form-outreach/automation/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Settings = {
  // 自動化フラグ
  auto_company_list: boolean;
  auto_send_messages: boolean;

  // 両方可能時の優先チャンネル
  dual_channel_priority: "form" | "email";

  // 法人リスト自動化
  company_schedule: "weekly" | "monthly";
  company_weekday?: number; // 1(月)〜7(日)
  company_month_day?: number; // 1-31
  company_limit?: number; // 取得件数

  // 送信自動化（承認フロー）
  confirm_by_email?: boolean;
  confirm_email_address?: string;

  // サーバーから返る想定
  updated_at?: string | null;
};

type ConflictRow = {
  id: string;
  client_name: string | null;
  company_name: string | null;
  website: string | null;
  detected_at: string | null;
};

export default function AutomationPage() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

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

  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);

  // 初期ロード
  useEffect(() => {
    const load = async () => {
      setMsg("");
      try {
        // 設定ロード
        const res = await fetch("/api/form-outreach/automation/settings", {
          headers: { "x-tenant-id": TENANT_ID },
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          const s = (j?.settings ?? j) as Partial<Settings>;
          const updated = j?.updatedAt || j?.updated_at || s.updated_at || null;

          setSettings((prev) => ({
            ...prev,
            ...s,
            updated_at: updated,
          }));
        }

        // クライアント被り候補
        const rc = await fetch("/api/form-outreach/conflicts", {
          headers: { "x-tenant-id": TENANT_ID },
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
  }, []);

  // 保存
  const save = async () => {
    if (loading) return;
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/automation/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({ settings }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "save failed");

      const updated = j?.updatedAt || j?.updated_at || new Date().toISOString();

      setSettings((prev) => ({ ...prev, updated_at: updated }));
      setMsg(`更新しました（${formatTs(updated)}）`);
      setEditing(false);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // 取消（再読込）
  const cancel = () => {
    setEditing(false);
    (async () => {
      try {
        const res = await fetch("/api/form-outreach/automation/settings", {
          headers: { "x-tenant-id": TENANT_ID },
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        const s = (j?.settings ?? j) as Partial<Settings>;
        const updated = j?.updatedAt || j?.updated_at || s.updated_at || null;
        setSettings((prev) => ({ ...prev, ...s, updated_at: updated }));
      } catch {}
    })();
  };

  // 現在設定の要約（チップに分割）
  const summaryChips = useMemo(() => {
    const chips: string[] = [];

    // 法人リストの自動作成
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

    // メッセージ送信の自動化
    if (settings.auto_send_messages) {
      chips.push(
        `送信: 自動（優先=${
          settings.dual_channel_priority === "form" ? "フォーム" : "メール"
        })`
      );
      if (settings.confirm_by_email) {
        chips.push(
          `承認: メール確認（${settings.confirm_email_address || "-"}）`
        );
      } else {
        chips.push("承認: なし（即時実行）");
      }
    } else {
      chips.push("送信: 自動化しない");
    }

    return chips;
  }, [settings]);

  // 右側薄文字の一文サマリ
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

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        {/* ヘッダー + 現在設定の強調カード */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-neutral-900">
                自動実行設定
              </h1>
              <p className="mt-1 text-xs text-neutral-500">
                最終更新：
                {settings.updated_at ? formatTs(settings.updated_at) : "-"}
              </p>
            </div>

            <div className="shrink-0">
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  設定変更
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={cancel}
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
              )}
            </div>
          </div>

          {/* 強調された現在設定カード */}
          <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">
            <div className="mb-2 text-sm font-medium text-neutral-800">
              現在の設定
            </div>

            {/* チップ群 */}
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

            {/* 薄文字のインライン要約（常時表示） */}
            <div className="mt-2 text-[11px] text-neutral-500">
              {summaryInline}
            </div>

            {/* 2カラムの概要グリッド */}
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* 法人リスト自動化 概要 */}
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
                  <dd className="col-span-2">
                    {settings.company_limit ?? "-"}
                  </dd>
                </dl>
              </div>

              {/* メッセージ送信 概要 */}
              <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
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
                    {settings.dual_channel_priority === "form"
                      ? "フォーム"
                      : "メール"}
                  </dd>

                  <dt className="col-span-1 text-neutral-500">承認</dt>
                  <dd className="col-span-2">
                    {settings.confirm_by_email
                      ? `メール確認（${settings.confirm_email_address || "-"}）`
                      : "なし（即時実行）"}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* 設定フォーム（「設定変更」クリック時のみ表示） */}
        {editing && (
          <section className="rounded-2xl border border-neutral-200 p-4 mb-6">
            {/* 法人リスト自動化 */}
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  checked={settings.auto_company_list}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      auto_company_list: e.target.checked,
                    }))
                  }
                />
                法人リストの作成を自動で行う
              </label>

              {settings.auto_company_list && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <div className="mb-1 text-xs text-neutral-600">頻度</div>
                    <select
                      className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                      value={settings.company_schedule}
                      onChange={(e) =>
                        setSettings((s) => ({
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

                  {settings.company_schedule === "weekly" ? (
                    <div>
                      <div className="mb-1 text-xs text-neutral-600">
                        実行曜日
                      </div>
                      <select
                        className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                        value={settings.company_weekday ?? 1}
                        onChange={(e) =>
                          setSettings((s) => ({
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
                        value={settings.company_month_day ?? 1}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            company_month_day: clampInt(e.target.value, 1, 31),
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
                      value={settings.company_limit ?? 100}
                      onChange={(e) =>
                        setSettings((s) => ({
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
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  checked={settings.auto_send_messages}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      auto_send_messages: e.target.checked,
                    }))
                  }
                />
                メッセージの送信を自動で行う
              </label>

              {settings.auto_send_messages && (
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
                          checked={settings.dual_channel_priority === "form"}
                          onChange={() =>
                            setSettings((s) => ({
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
                          checked={settings.dual_channel_priority === "email"}
                          onChange={() =>
                            setSettings((s) => ({
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
                        checked={!!settings.confirm_by_email}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            confirm_by_email: e.target.checked,
                          }))
                        }
                      />
                      メールで承認する
                    </label>
                  </div>

                  {settings.confirm_by_email && (
                    <div>
                      <div className="mb-1 text-xs text-neutral-600">
                        確認用メールアドレス
                      </div>
                      <input
                        type="email"
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        placeholder="example@yourdomain.jp"
                        value={settings.confirm_email_address ?? ""}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            confirm_email_address: e.target.value.trim(),
                          }))
                        }
                      />
                      <p className="mt-1 text-[11px] text-neutral-500">
                        送信予定のリストがこのアドレスへ届き、メール上の「実行」ボタン押下で送信されます。
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* クライアントと被っている可能性のある企業リスト */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 text-sm font-medium text-neutral-800">
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
                        className="text-indigo-700 hover:underline break-all"
                      >
                        {c.website}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {c.detected_at ? formatTs(c.detected_at) : "-"}
                  </td>
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
    </>
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

function formatTs(ts: string) {
  try {
    const t = ts.replace("T", " ").replace("Z", "");
    const dt = t.split(".")[0] || t;
    return dt;
  } catch {
    return ts;
  }
}

function clampInt(v: string, min: number, max: number) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
