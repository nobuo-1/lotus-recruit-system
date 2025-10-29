// web/src/app/form-outreach/templates/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type TemplateRow = {
  id: string;
  name: string;
  subject: string | null;
  channel: string | null;
  created_at: string | null;
};

export default function TemplatesPage() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [msg, setMsg] = useState("");

  // 新規作成モーダル
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  const load = async () => {
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/templates", {
        headers: { "x-tenant-id": TENANT_ID },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
      setRows([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 置き換えプレビュー
  const preview = useMemo(() => {
    const samples = {
      "{{sender_company}}": "株式会社LOTUS",
      "{{sender_name}}": "山田 太郎",
      "{{recipient_company}}": "○○株式会社",
      "{{website}}": "https://example.com",
      "{{today}}": new Date().toISOString().slice(0, 10),
    } as Record<string, string>;

    let t = bodyText || "";
    for (const k of Object.keys(samples)) {
      t = t.split(k).join(samples[k]);
    }
    return t;
  }, [bodyText]);

  const save = async () => {
    try {
      const r = await fetch("/api/form-outreach/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({
          name,
          subject,
          body_text: bodyText,
          // body_html は必要に応じて別UIで
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "insert failed");
      setOpen(false);
      setName("");
      setSubject("");
      setBodyText("");
      await load();
    } catch (e: any) {
      alert(String(e?.message || e));
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              メッセージテンプレート
            </h1>
            <p className="text-sm text-neutral-500">
              form_outreach_messages（channel='template'
              優先、無ければ全件）を表示します。
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            新規作成
          </button>
        </div>

        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">件名</th>
                <th className="px-3 py-3 text-left">チャンネル</th>
                <th className="px-3 py-3 text-left">作成日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="px-3 py-2">{t.subject || "-"}</td>
                  <td className="px-3 py-2">{t.channel || "-"}</td>
                  <td className="px-3 py-2">
                    {t.created_at?.replace("T", " ").replace("Z", "") || "-"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    テンプレートがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}

        {/* 新規作成モーダル */}
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-[900px] max-w-[95vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div className="font-semibold">テンプレート新規作成</div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                    onClick={() => setOpen(false)}
                  >
                    閉じる
                  </button>
                  <button
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                    onClick={save}
                  >
                    作成
                  </button>
                </div>
              </div>

              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-neutral-600 mb-1">名称</div>
                    <input
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-600 mb-1">件名</div>
                    <input
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-600 mb-1">
                      本文（置き換え可：{" "}
                      <code className="text-[11px]">
                        {
                          "{{sender_company}}, {{sender_name}}, {{recipient_company}}, {{website}}, {{today}}"
                        }
                      </code>
                      ）
                    </div>
                    <textarea
                      rows={12}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-neutral-600">プレビュー</div>
                  <div className="rounded-xl border border-neutral-200 p-3 h-[350px] overflow-auto whitespace-pre-wrap text-sm">
                    {preview || (
                      <span className="text-neutral-400">
                        本文を入力するとここにプレビュー
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    *
                    置き換えは画面上の簡易プレビューです。送信時はテンプレートエンジン側で本データに置換します。
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-neutral-200 text-xs text-neutral-500">
                POST /api/form-outreach/templates で作成（tenant 固定）
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
