// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Prospect = {
  id: string;
  company_name: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_form_url: string | null;
};
type Template = { id: string; name: string; body_text: string };

export default function ManualRun() {
  const [mode, setMode] = useState<"form" | "email">("form");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/form-outreach/prospects?mode=${mode}`, {
        cache: "no-store",
      });
      const j = await res.json();
      setProspects(j?.rows ?? []);
      const t = await fetch(`/api/form-outreach/templates`, {
        cache: "no-store",
      }).then((r) => r.json());
      setTemplates(t?.rows ?? []);
    })();
  }, [mode]);

  const canSend = useMemo(
    () => selected.length > 0 && templateId,
    [selected, templateId]
  );

  const submit = async () => {
    if (!canSend) return;
    await fetch(`/api/form-outreach/send`, {
      method: "POST",
      body: JSON.stringify({ mode, prospectIds: selected, templateId }),
      headers: { "Content-Type": "application/json" },
    });
    alert("送信キューに登録しました。フロー詳細でご確認ください。");
    setSelected([]);
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">手動実行</h1>
          <p className="text-sm text-neutral-500">
            フォーム入力 または メール送信を選び、対象を選択して送信します。
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["form", "email"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-2 py-1 text-xs ${
                mode === m
                  ? "border border-indigo-400 text-indigo-700"
                  : "border border-neutral-200 text-neutral-600"
              }`}
            >
              {m === "form" ? "フォーム入力" : "メール送信"}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-neutral-200">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left w-10">選択</th>
                <th className="px-3 py-3 text-left">企業名</th>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">
                  {mode === "form" ? "フォームURL" : "メール"}
                </th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, p.id]
                            : prev.filter((x) => x !== p.id)
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{p.company_name}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {p.website_url}
                  </td>
                  <td className="px-3 py-2">
                    {mode === "form"
                      ? p.contact_form_url || "-"
                      : p.contact_email || "-"}
                  </td>
                </tr>
              ))}
              {prospects.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    対象がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <select
            className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">テンプレートを選択</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={!canSend}
            className={`rounded-lg px-3 py-1 text-sm ${
              canSend
                ? "border border-neutral-200 hover:bg-neutral-50"
                : "border border-neutral-100 text-neutral-400"
            }`}
          >
            送信
          </button>
        </div>
      </main>
    </>
  );
}
