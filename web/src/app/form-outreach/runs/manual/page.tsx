// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

type Mode = "form" | "email" | "all";

type Prospect = {
  id: string;
  company_name: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_form_url: string | null;
  has_conflict?: boolean | null;
};

type Template = { id: string; name: string; body_text: string };

export default function ManualRun() {
  const [mode, setMode] = useState<Mode>("form");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [preview, setPreview] = useState<string>("");

  const filtered = useMemo(() => {
    if (mode === "form") return prospects.filter((p) => !!p.contact_form_url);
    if (mode === "email") return prospects.filter((p) => !!p.contact_email);
    return prospects.filter((p) => !!p.contact_form_url || !!p.contact_email);
  }, [mode, prospects]);

  const allVisibleIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const allChecked =
    selected.length > 0 && selected.length === allVisibleIds.length;

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

  useEffect(() => {
    setSelected([]);
  }, [mode, prospects.length]);

  const canSend = useMemo(
    () => selected.length > 0 && !!templateId,
    [selected, templateId]
  );

  const toggleOne = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const toggleAll = () =>
    setSelected((prev) =>
      allChecked ? [] : Array.from(new Set([...prev, ...allVisibleIds]))
    );

  const requestPreview = async () => {
    if (!templateId) return setPreview("");
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return setPreview("");
    const vars = {
      sender_company: "（送信元）御社名",
      sender_name: "（送信元）担当名",
      recipient_company: "（相手先）会社名",
      website: "https://example.com",
    };
    const res = await fetch(`/api/form-outreach/templates/preview`, {
      method: "POST",
      body: JSON.stringify({ template: tpl.body_text, vars }),
      headers: { "Content-Type": "application/json" },
    });
    const j = await res.json();
    setPreview(j?.preview ?? tpl.body_text);
  };

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
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              手動実行
            </h1>
            <p className="text-sm text-neutral-500">
              フォーム入力／メール送信／すべて
              を切り替えて、対象を選択しテンプレートで送信します。
            </p>
          </div>
          <Link
            href="/form-outreach/templates"
            className="rounded-xl border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            テンプレート管理へ
          </Link>
        </div>

        {/* モード切替 */}
        <div className="mb-5 flex flex-wrap gap-2">
          {(["form", "email", "all"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-2 py-1 text-xs ${
                mode === m
                  ? "border border-indigo-400 text-indigo-700"
                  : "border border-neutral-200 text-neutral-600"
              }`}
            >
              {m === "form"
                ? "フォーム入力"
                : m === "email"
                ? "メール送信"
                : "すべて"}
            </button>
          ))}
        </div>

        {/* テンプレ選択（目立たせる） */}
        <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-indigo-900">
              メッセージテンプレート
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-neutral-200 px-2 py-1 text-sm bg-white"
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
                type="button"
                onClick={requestPreview}
                className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                プレビュー
              </button>
            </div>
          </div>
          {preview && (
            <div className="mt-2 rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-800 whitespace-pre-wrap">
              {preview}
            </div>
          )}
        </div>

        {/* 一覧 */}
        <div className="rounded-2xl border border-neutral-200">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-3 text-left w-8">⚠︎</th>
                <th className="px-3 py-3 text-left">企業名</th>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">
                  {mode === "form"
                    ? "フォームURL"
                    : mode === "email"
                    ? "メール"
                    : "フォーム / メール"}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggleOne(p.id)}
                    />
                  </td>
                  <td className="px-3 py-2">{p.has_conflict ? "⚠︎" : ""}</td>
                  <td className="px-3 py-2">{p.company_name}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {p.website_url}
                  </td>
                  <td className="px-3 py-2">
                    {mode === "form"
                      ? p.contact_form_url || "-"
                      : mode === "email"
                      ? p.contact_email || "-"
                      : [p.contact_form_url, p.contact_email]
                          .filter(Boolean)
                          .join(" / ") || "-"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    対象がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* アクション */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
          <span className="text-xs text-neutral-500">
            選択件数: {selected.length} / 表示 {filtered.length}
          </span>
        </div>
      </main>
    </>
  );
}
