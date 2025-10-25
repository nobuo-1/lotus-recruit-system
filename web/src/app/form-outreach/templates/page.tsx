// web/src/app/form-outreach/templates/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Template = {
  id: string;
  name: string;
  body_text: string;
  created_at?: string;
};

export default function TemplatesPage() {
  const [rows, setRows] = useState<Template[]>([]);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  const fetchRows = async () => {
    try {
      const res = await fetch("/api/form-outreach/templates", {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "fetch error");
      setRows(j.rows ?? []);
      setMsg("");
    } catch (e: any) {
      setRows([]);
      setMsg(String(e?.message || e));
    }
  };
  useEffect(() => {
    fetchRows();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const res = await fetch(`/api/form-outreach/templates/${id}`, {
      method: "DELETE",
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "delete failed");
    fetchRows();
  };

  const updateInline = async (id: string, patch: Partial<Template>) => {
    const res = await fetch(`/api/form-outreach/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "update failed");
    fetchRows();
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              メッセージテンプレート
            </h1>
            <p className="text-sm text-neutral-500">
              一覧・編集・削除（新規作成はモーダルから）
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            ＋ 新規テンプレート
          </button>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4">
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">名称</th>
                  <th className="px-3 py-3 text-left">本文</th>
                  <th className="px-3 py-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3">
                      <input
                        defaultValue={r.name}
                        onBlur={(e) =>
                          updateInline(r.id, { name: e.target.value })
                        }
                        className="rounded-lg border border-neutral-200 px-2 py-1 text-sm w-56"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <textarea
                        defaultValue={r.body_text}
                        rows={3}
                        onBlur={(e) =>
                          updateInline(r.id, { body_text: e.target.value })
                        }
                        className="rounded-lg border border-neutral-200 px-2 py-1 text-sm w-full"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <button
                        className="rounded-lg px-2 py-1 border text-xs"
                        onClick={() => remove(r.id)}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      テンプレートがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {msg && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
              {msg}
            </pre>
          )}
        </section>

        {open && (
          <NewTemplateModal
            onClose={() => {
              setOpen(false);
              fetchRows();
            }}
          />
        )}
      </main>
    </>
  );
}

function NewTemplateModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState("");
  const [msg, setMsg] = useState("");

  const doPreview = async () => {
    const vars = {
      sender_company: "（送信元）御社名",
      sender_name: "（送信元）担当名",
      recipient_company: "（相手先）会社名",
      website: "https://example.com",
    };
    const res = await fetch("/api/form-outreach/templates/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: body, vars }),
    });
    const j = await res.json();
    setPreview(j?.preview || body);
  };

  const create = async () => {
    const res = await fetch("/api/form-outreach/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, body_text: body }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "create failed");
    onClose();
  };

  const canCreate = name.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[900px] max-w-[96vw] rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">新規テンプレート</div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 border hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-neutral-600 mb-1">テンプレート名</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            />
            <div className="mt-3">
              <div className="text-xs text-neutral-600 mb-1">
                本文（{"{{sender_company}}"}, {"{{sender_name}}"},{" "}
                {"{{recipient_company}}"}, {"{{website}}"}）
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={doPreview}
                disabled={!body.trim()}
                className={`rounded-lg px-3 py-1 text-sm ${
                  body.trim()
                    ? "border border-neutral-200 hover:bg-neutral-50"
                    : "border border-neutral-100 text-neutral-400"
                }`}
              >
                プレビュー
              </button>
              <button
                onClick={create}
                disabled={!canCreate}
                className={`rounded-lg px-3 py-1 text-sm ${
                  canCreate
                    ? "border border-neutral-200 hover:bg-neutral-50"
                    : "border border-neutral-100 text-neutral-400"
                }`}
              >
                作成
              </button>
            </div>
            {msg && (
              <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
                {msg}
              </pre>
            )}
          </div>
          <div>
            <div className="text-xs text-neutral-600 mb-1">プレビュー</div>
            <div className="rounded-xl border bg-white p-3 text-sm text-neutral-800 whitespace-pre-wrap min-h-[240px]">
              {preview ||
                "（プレビューは本文を入力して「プレビュー」を押してください）"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
