// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Prospect = {
  id: string;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  contact_form_url: string | null;
  industry: string | null;
  company_size: string | null;
  created_at: string | null;
};

type Template = {
  id: string;
  name: string;
  subject?: string | null;
  body_text: string;
  body_html?: string | null;
};

const INDUSTRIES = [
  "IT・SaaS",
  "製造",
  "小売",
  "物流・運輸",
  "医療・ヘルスケア",
  "建設",
  "不動産",
  "教育",
  "金融・保険",
  "広告・マーケ",
  "飲食・観光",
  "エネルギー",
  "アパレル",
  "その他",
];

export default function ManualRun() {
  const [mode, setMode] = useState<"form" | "email">("form");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [msg, setMsg] = useState("");

  // フィルタ
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [size, setSize] = useState<"" | "small" | "mid" | "large">("");

  // テンプレ表示/プレビュー
  const [showTpl, setShowTpl] = useState(false);
  const [preview, setPreview] = useState<{
    body_text: string;
    body_html?: string | null;
  } | null>(null);
  const selTpl = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId]
  );

  // prospects 読み込み
  const loadProspects = async () => {
    setMsg("");
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (industry) params.set("industry", industry);
      if (size) params.set("size", size);
      const r = await fetch(
        `/api/form-outreach/prospects?${params.toString()}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setProspects(j.rows ?? []);
    } catch (e: any) {
      setProspects([]);
      setMsg(String(e?.message || e));
    }
  };

  // templates 読み込み
  const loadTemplates = async () => {
    const r = await fetch("/api/form-outreach/templates", {
      cache: "no-store",
    });
    const j = await r.json();
    if (r.ok) setTemplates(j.rows ?? []);
  };

  useEffect(() => {
    loadProspects();
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    alert("送信キューに登録しました。");
    setSelected([]);
  };

  const openPreview = async () => {
    if (!selTpl) return;
    const r = await fetch("/api/form-outreach/templates/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body_text: selTpl.body_text,
        body_html: selTpl.body_html,
        vars: { company_name: "〇〇株式会社", contact_name: "ご担当者様" },
      }),
    });
    const j = await r.json();
    setPreview(j);
    setShowTpl(true);
  };

  // 規模フィルタの表示用
  const sizeLabel = (s: typeof size) =>
    s === "small"
      ? "小(1-49)"
      : s === "mid"
      ? "中(50-249)"
      : s === "large"
      ? "大(250+)"
      : "すべて";

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">手動実行</h1>
          <p className="text-sm text-neutral-500">
            対象企業を選んでテンプレートを送信します。
          </p>
        </div>

        {/* フィルタ */}
        <section className="rounded-2xl border border-neutral-200 p-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              placeholder="会社名/URL 検索"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm w-64"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="rounded-lg border border-neutral-200 px-2 py-2 text-sm"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            >
              <option value="">業種: すべて</option>
              {INDUSTRIES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-neutral-200 px-2 py-2 text-sm"
              value={size}
              onChange={(e) => setSize(e.target.value as any)}
            >
              <option value="">規模: すべて</option>
              <option value="small">小(1-49)</option>
              <option value="mid">中(50-249)</option>
              <option value="large">大(250+)</option>
            </select>
            <button
              onClick={loadProspects}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              絞り込みを適用
            </button>
            <span className="text-xs text-neutral-500">
              業種: {industry || "すべて"} / 規模: {sizeLabel(size)}
            </span>
          </div>
        </section>

        {/* 一覧 */}
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
                <th className="px-3 py-3 text-left">業種</th>
                <th className="px-3 py-3 text-left">規模</th>
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
                  <td className="px-3 py-2 text-neutral-600">{p.website}</td>
                  <td className="px-3 py-2">
                    {mode === "form"
                      ? p.contact_form_url || "-"
                      : p.contact_email || "-"}
                  </td>
                  <td className="px-3 py-2">{p.industry || "-"}</td>
                  <td className="px-3 py-2">{p.company_size || "-"}</td>
                </tr>
              ))}
              {prospects.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    対象がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* テンプレート選択・送信 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
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
              onClick={openPreview}
              disabled={!templateId}
              className={`rounded-lg px-3 py-1 text-sm ${
                templateId
                  ? "border border-neutral-200 hover:bg-neutral-50"
                  : "border border-neutral-100 text-neutral-400"
              }`}
            >
              プレビュー
            </button>
          </div>

          <div className="flex items-center gap-2">
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
          {msg && <span className="text-xs text-red-600 ml-2">{msg}</span>}
        </div>

        {/* プレビューモーダル */}
        {showTpl && preview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-[720px] max-w-[96vw] rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="font-semibold">
                  テンプレートプレビュー：{selTpl?.name}
                </div>
                <button
                  onClick={() => setShowTpl(false)}
                  className="rounded-lg px-2 py-1 border text-sm hover:bg-neutral-50"
                >
                  閉じる
                </button>
              </div>
              <div className="p-4">
                <div className="text-sm whitespace-pre-wrap">
                  {preview.body_text}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
