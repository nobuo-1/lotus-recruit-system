// web/src/app/form-outreach/templates/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Template = {
  id: string;
  name: string;
  body_text: string;
  created_at?: string;
};

const VAR_HINTS = [
  "{{sender_company}} / {{sender_name}} / {{recipient_company}} / {{website}}",
];

export default function TemplatesPage() {
  const [rows, setRows] = useState<Template[]>([]);
  const [msg, setMsg] = useState("");

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState("");

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

  const create = async () => {
    const res = await fetch("/api/form-outreach/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, body_text: body }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "create failed");
    setName("");
    setBody("");
    setPreview("");
    fetchRows();
  };

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

  const canCreate = useMemo(
    () => name.trim().length > 0 && body.trim().length > 0,
    [name, body]
  );

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">
            メッセージテンプレート
          </h1>
          <p className="text-sm text-neutral-500">
            新規作成・編集・削除、変数置換のプレビューができます。
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4 mb-6">
          <div className="mb-2 text-sm font-semibold text-neutral-800">
            新規作成
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-neutral-600 mb-1">
                テンプレート名
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
              <div className="mt-3">
                <div className="text-xs text-neutral-600 mb-1">
                  本文（プレーンテキスト）
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                利用可能変数：{VAR_HINTS.join(" / ")}
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
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">プレビュー</div>
              <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-800 whitespace-pre-wrap min-h-[220px]">
                {preview}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 text-sm font-semibold text-neutral-800">
            テンプレート一覧
          </div>
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
                  <tr key={r.id} className="border-top border-neutral-200">
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
                      <button className="btn-mini" onClick={() => remove(r.id)}>
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

        <style jsx global>{`
          .btn-mini {
            border: 1px solid rgba(0, 0, 0, 0.12);
            border-radius: 8px;
            padding: 2px 8px;
            font-size: 12px;
            color: #555;
          }
          .btn-mini:hover {
            background: #f8f8f8;
          }
        `}</style>
      </main>
    </>
  );
}
