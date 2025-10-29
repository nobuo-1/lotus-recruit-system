// web/src/app/form-outreach/automation/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Settings = {
  auto_company_list: boolean; // 法人リストの自動作成
  auto_send_messages: boolean; // メッセージの自動送信
  dual_channel_priority: "form" | "email"; // 両方可の場合の優先
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
  const [settings, setSettings] = useState<Settings>({
    auto_company_list: false,
    auto_send_messages: false,
    dual_channel_priority: "form",
  });

  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setMsg("");
      try {
        // 設定のロード
        const res = await fetch("/api/form-outreach/automation/settings", {
          headers: { "x-tenant-id": TENANT_ID },
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json();
          if (j?.settings) setSettings({ ...settings, ...j.settings });
        }

        // 競合(被り)候補
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setMsg("保存しました。");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">
            自動実行設定
          </h1>
          <p className="text-sm text-neutral-500">
            「法人リストの作成」と「メッセージの送信」の自動化を選択し、両方可能な場合の優先チャンネルを設定できます。
          </p>
        </div>

        {/* 設定カード */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

            <div>
              <div className="mb-1 text-xs text-neutral-600">
                両方可能な場合の優先チャンネル
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
                  フォームを優先
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
                  メールを優先
                </label>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={save}
              disabled={loading}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {loading ? "保存中…" : "保存する"}
            </button>
          </div>

          {msg && (
            <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600">
              {msg}
            </pre>
          )}
        </section>

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
                    {c.detected_at
                      ? c.detected_at.replace("T", " ").replace("Z", "")
                      : "-"}
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
      </main>
    </>
  );
}
