// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

type Prospect = {
  id: string;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  contact_form_url: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  status: string | null;
};
type Template = { id: string; name: string; channel: string };

export default function ManualRun() {
  const [mode, setMode] = useState<"form" | "email" | "all">("form");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [preview, setPreview] = useState<{
    open: boolean;
    title: string;
    body: string;
  }>({
    open: false,
    title: "",
    body: "",
  });

  // フィルタ
  const [kw, setKw] = useState("");
  const [size, setSize] = useState<string>("");
  const [industry, setIndustry] = useState<string>("");

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
      setTemplates(
        (t?.rows ?? []).map((x: any) => ({
          id: x.id,
          name: x.name,
          channel: x.channel,
        }))
      );
    })();
  }, [mode]);

  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      if (kw) {
        const q = kw.toLowerCase();
        const hit =
          (p.company_name || "").toLowerCase().includes(q) ||
          (p.website || "").toLowerCase().includes(q) ||
          (p.contact_email || "").toLowerCase().includes(q) ||
          (p.contact_form_url || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (size && (p.company_size || "") !== size) return false;
      if (industry && (p.industry || "") !== industry) return false;
      return true;
    });
  }, [prospects, kw, size, industry]);

  const canSend = useMemo(
    () => selected.length > 0 && templateId,
    [selected, templateId]
  );

  const submit = async () => {
    if (!canSend) return;
    // 確認モーダルを開く
    const ids = selected.slice();
    const companies = filtered.filter((p) => ids.includes(p.id));
    setConfirm({ open: true, companies });
  };

  // 確認モーダル
  const [confirm, setConfirm] = useState<{
    open: boolean;
    companies: Prospect[];
  }>({
    open: false,
    companies: [],
  });
  const doSend = async () => {
    await fetch(`/api/form-outreach/send`, {
      method: "POST",
      body: JSON.stringify({ mode, prospectIds: selected, templateId }),
      headers: { "Content-Type": "application/json" },
    });
    alert("送信キューに登録しました。フロー詳細でご確認ください。");
    setSelected([]);
    setConfirm({ open: false, companies: [] });
  };

  const previewTemplate = async (tid: string) => {
    if (!tid) return;
    const res = await fetch("/api/form-outreach/templates/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: tid,
        vars: { from_name: "担当 太郎", to_company: "サンプル株式会社" },
      }),
    });
    const j = await res.json();
    setPreview({ open: true, title: j?.title || "", body: j?.body || "" });
  };

  const modes = [
    { k: "form", label: "フォーム入力" },
    { k: "email", label: "メール送信" },
    { k: "all", label: "すべて" },
  ] as const;

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              手動実行
            </h1>
            <p className="text-sm text-neutral-500">
              対象をフィルタしてテンプレートで一括送信します。
            </p>
          </div>
          <Link
            href="/form-outreach/messages"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            送信ログ
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {modes.map((m) => (
            <button
              key={m.k}
              onClick={() => setMode(m.k as any)}
              className={`rounded-lg px-2 py-1 text-xs ${
                mode === m.k
                  ? "border border-indigo-400 text-indigo-700"
                  : "border border-neutral-200 text-neutral-600"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* フィルタ */}
        <div className="mb-3 grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="検索（社名・サイト・メール等）"
            className="rounded-lg border px-2 py-1 text-sm"
          />
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="rounded-lg border px-2 py-1 text-sm"
          >
            <option value="">規模（すべて）</option>
            <option value="small">小規模</option>
            <option value="mid">中規模</option>
            <option value="large">大規模</option>
          </select>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="rounded-lg border px-2 py-1 text-sm"
          >
            <option value="">業種（すべて）</option>
            <option value="it">IT</option>
            <option value="mfg">製造</option>
            <option value="other">その他</option>
          </select>
        </div>

        <div className="rounded-2xl border border-neutral-200">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left w-10">選択</th>
                <th className="px-3 py-3 text-left">企業名</th>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">公式サイト</th>
                <th className="px-3 py-3 text-left">フォーム</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">規模</th>
                <th className="px-3 py-3 text-left">業種</th>
                <th className="px-3 py-3 text-left">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
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
                    {p.job_site_source || "-"}
                  </td>
                  <td className="px-3 py-2">{p.website || "-"}</td>
                  <td className="px-3 py-2">{p.contact_form_url || "-"}</td>
                  <td className="px-3 py-2">{p.contact_email || "-"}</td>
                  <td className="px-3 py-2">{p.company_size || "-"}</td>
                  <td className="px-3 py-2">{p.industry || "-"}</td>
                  <td className="px-3 py-2">{p.status || "-"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    対象がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* テンプレート選択 + プレビュー */}
        <div className="mt-4 flex items-center gap-2">
          <select
            className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">テンプレートを選択</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（{t.channel}）
              </option>
            ))}
          </select>

          <button
            onClick={() => previewTemplate(templateId)}
            disabled={!templateId}
            className={`rounded-lg px-3 py-1 text-sm border ${
              templateId
                ? "hover:bg-neutral-50"
                : "text-neutral-400 border-neutral-200"
            }`}
          >
            プレビュー
          </button>

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

        {/* プレビューモーダル */}
        {preview.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="w-[860px] max-w-[96vw] rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="font-semibold">
                  {preview.title || "プレビュー"}
                </div>
                <button
                  onClick={() =>
                    setPreview({ open: false, title: "", body: "" })
                  }
                  className="rounded-lg px-2 py-1 border hover:bg-neutral-50 text-sm"
                >
                  閉じる
                </button>
              </div>
              <div className="p-4">
                <pre className="whitespace-pre-wrap text-sm text-neutral-800">
                  {preview.body}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* 確認モーダル */}
        {confirm.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="w-[860px] max-w-[96vw] rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="font-semibold">以下の企業へ送信します</div>
                <button
                  onClick={() => setConfirm({ open: false, companies: [] })}
                  className="rounded-lg px-2 py-1 border hover:bg-neutral-50 text-sm"
                >
                  キャンセル
                </button>
              </div>
              <div className="p-4">
                <ul className="list-disc pl-5 text-sm">
                  {confirm.companies.map((c) => (
                    <li key={c.id}>
                      {c.company_name}（
                      {mode === "email"
                        ? c.contact_email || "-"
                        : c.contact_form_url || "-"}
                      ）
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-4 py-3 border-t">
                <button
                  onClick={doSend}
                  className="rounded-lg border px-3 py-1 text-sm hover:bg-neutral-50"
                >
                  実行
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
