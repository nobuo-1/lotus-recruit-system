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

type TemplateDetail = {
  id: string;
  name: string;
  subject: string | null;
  body_text: string | null;
  body_html?: string | null;
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

  // 編集モーダル
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>("");
  const [eName, setEName] = useState("");
  const [eSubject, setESubject] = useState("");
  const [eBodyText, setEBodyText] = useState("");

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

  // 置き換えプレビュー（新規）
  const preview = useMemo(() => {
    const samples = {
      "{{sender_company}}": "株式会社LOTUS",
      "{{sender_name}}": "山田 太郎",
      "{{sender_email}}": "sales@example.com",
      "{{sender_reply_to}}": "reply@example.com",
      "{{sender_phone}}": "03-1234-5678",
      "{{sender_website}}": "https://lotus.example.com",
      "{{recipient_company}}": "○○株式会社",
      "{{website}}": "https://example.com",
      "{{signature}}":
        "―――――――――\n株式会社LOTUS\n営業部 山田\nhttps://lotus.example.com",
      "{{today}}": new Date().toISOString().slice(0, 10),
    } as Record<string, string>;
    let t = bodyText || "";
    for (const k of Object.keys(samples)) t = t.split(k).join(samples[k]);
    return t;
  }, [bodyText]);

  // 置き換えプレビュー（編集）
  const ePreview = useMemo(() => {
    const samples = {
      "{{sender_company}}": "株式会社LOTUS",
      "{{sender_name}}": "山田 太郎",
      "{{sender_email}}": "sales@example.com",
      "{{sender_reply_to}}": "reply@example.com",
      "{{sender_phone}}": "03-1234-5678",
      "{{sender_website}}": "https://lotus.example.com",
      "{{recipient_company}}": "○○株式会社",
      "{{website}}": "https://example.com",
      "{{signature}}":
        "―――――――――\n株式会社LOTUS\n営業部 山田\nhttps://lotus.example.com",
      "{{today}}": new Date().toISOString().slice(0, 10),
    } as Record<string, string>;
    let t = eBodyText || "";
    for (const k of Object.keys(samples)) t = t.split(k).join(samples[k]);
    return t;
  }, [eBodyText]);

  // 新規作成
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

  // 編集開始：サーバから既存値を取得してモーダルへ反映
  const openEdit = async (id: string) => {
    setMsg("");
    try {
      const r = await fetch(`/api/form-outreach/templates/${id}`, {
        headers: { "x-tenant-id": TENANT_ID },
        cache: "no-store",
      });
      const j: { row?: TemplateDetail; error?: string } = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch detail failed");
      const t = j.row!;
      setEditingId(t.id);
      setEName(t.name || "");
      setESubject(t.subject || "");
      setEBodyText(t.body_text || "");
      setEditOpen(true);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  // 編集保存
  const update = async () => {
    try {
      const r = await fetch(`/api/form-outreach/templates/${editingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({
          name: eName,
          subject: eSubject,
          body_text: eBodyText,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "update failed");
      setEditOpen(false);
      await load();
    } catch (e: any) {
      alert(String(e?.message || e));
    }
  };

  // 削除
  const remove = async (id: string) => {
    if (!confirm("このテンプレートを削除します。よろしいですか？")) return;
    try {
      const r = await fetch(`/api/form-outreach/templates/${id}`, {
        method: "DELETE",
        headers: { "x-tenant-id": TENANT_ID },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "delete failed");
      await load();
    } catch (e: any) {
      alert(String(e?.message || e));
    }
  };

  const placeholdersLine =
    "{{sender_company}}, {{sender_name}}, {{sender_email}}, {{sender_reply_to}}, {{sender_phone}}, {{sender_website}}, {{recipient_company}}, {{website}}, {{signature}}, {{today}}";

  const PlaceholderHelp = () => (
    <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-[11px] leading-5 text-neutral-700">
      <div className="font-medium mb-1">差し込み変数一覧</div>
      <ul className="list-disc ml-5 space-y-0.5">
        <li>
          <code>{"{{sender_company}}"}</code> / <code>{"{{sender_name}}"}</code>
          ：送信者名（送信元設定の from_name、未設定時は{" "}
          <code>Lotus System</code>）
        </li>
        <li>
          <code>{"{{sender_email}}"}</code>：送信メール（送信元設定）
        </li>
        <li>
          <code>{"{{sender_reply_to}}"}</code>：Reply-To（送信元設定）
        </li>
        <li>
          <code>{"{{sender_phone}}"}</code>：電話番号（送信元設定）
        </li>
        <li>
          <code>{"{{sender_website}}"}</code>：WebサイトURL（送信元設定）
        </li>
        <li>
          <code>{"{{signature}}"}</code>
          ：署名（送信元設定。本文末尾にも自動追記されます）
        </li>
        <li>
          <code>{"{{recipient_company}}"}</code>：相手企業名（行ごとに差し替え）
        </li>
        <li>
          <code>{"{{website}}"}</code>：相手企業サイトURL（取得できた場合）
        </li>
        <li>
          <code>{"{{today}}"}</code>：送信日の YYYY-MM-DD
        </li>
      </ul>
    </div>
  );

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
              form_outreach_messages（channel='template'）を管理します。
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
          <table className="min-w-[880px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">件名</th>
                <th className="px-3 py-3 text-left">チャンネル</th>
                <th className="px-3 py-3 text-left">作成日時</th>
                <th className="px-3 py-3 text-right">操作</th>
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
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(t.id)}
                        className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => remove(t.id)}
                        className="rounded-lg border border-red-200 text-red-600 px-2 py-1 text-xs hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
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
                      本文（置き換え可）：
                      <code className="text-[11px]">{placeholdersLine}</code>
                    </div>
                    <textarea
                      rows={12}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                    />
                    <PlaceholderHelp />
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
                    置き換えは画面上の簡易プレビューです。送信時はテンプレートエンジンで本データに置換します。
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 編集モーダル */}
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-[900px] max-w-[95vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div className="font-semibold">テンプレートを編集</div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                    onClick={() => setEditOpen(false)}
                  >
                    閉じる
                  </button>
                  <button
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                    onClick={update}
                  >
                    保存
                  </button>
                </div>
              </div>

              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-neutral-600 mb-1">名称</div>
                    <input
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      value={eName}
                      onChange={(e) => setEName(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-600 mb-1">件名</div>
                    <input
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      value={eSubject}
                      onChange={(e) => setESubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-600 mb-1">
                      本文（置き換え可）：
                      <code className="text-[11px]">{placeholdersLine}</code>
                    </div>
                    <textarea
                      rows={12}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      value={eBodyText}
                      onChange={(e) => setEBodyText(e.target.value)}
                    />
                    <PlaceholderHelp />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-neutral-600">プレビュー</div>
                  <div className="rounded-xl border border-neutral-200 p-3 h-[350px] overflow-auto whitespace-pre-wrap text-sm">
                    {ePreview || (
                      <span className="text-neutral-400">
                        本文を入力するとここにプレビュー
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    *
                    置き換えは画面上の簡易プレビューです。送信時はテンプレートエンジンで本データに置換します。
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
