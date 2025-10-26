// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Toggle from "@/components/Toggle";

type Prospect = {
  id: string;
  tenant_id: string;
  company_name: string;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null; // "small" | "mid" | "large" など
  job_site_source: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type TemplateRow = {
  id: string;
  name: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  created_at: string;
};

export default function ManualRunPage() {
  const [mode, setMode] = useState<"all" | "form" | "email">("all");
  const [showSent, setShowSent] = useState<"unsent" | "sent" | "all">("unsent");
  const [rows, setRows] = useState<Prospect[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");

  // テンプレモーダル
  const [openTpl, setOpenTpl] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [tplId, setTplId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`/api/form-outreach/prospects?mode=${mode}`, {
          cache: "no-store",
        }),
        fetch(`/api/form-outreach/sent-map`, { cache: "no-store" }),
      ]);
      const pj = await pRes.json();
      const sj = await sRes.json();
      if (!pRes.ok) throw new Error(pj?.error || "load prospects failed");
      if (!sRes.ok) throw new Error(sj?.error || "load sent-map failed");
      setRows(pj.rows ?? []);
      setSentIds(new Set<string>(sj.sentIds ?? []));
      setSel(new Set());
      setMsg("");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  useEffect(() => {
    load();
  }, [mode]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const isSent = sentIds.has(r.id);
      if (showSent === "unsent" && isSent) return false;
      if (showSent === "sent" && !isSent) return false;
      return true;
    });
  }, [rows, sentIds, showSent]);

  const allChecked =
    filtered.length > 0 && filtered.every((r) => sel.has(r.id));
  const toggleAll = (v: boolean) => {
    const next = new Set(sel);
    if (v) filtered.forEach((r) => next.add(r.id));
    else filtered.forEach((r) => next.delete(r.id));
    setSel(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  };

  const openTemplateModal = async () => {
    const r = await fetch("/api/form-outreach/templates", {
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j?.error || "load templates failed");
    setTemplates(j.rows ?? []);
    setOpenTpl(true);
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              フォーム営業：手動実行
            </h1>
            <p className="text-sm text-neutral-500">
              見込み企業の抽出・テンプレート選択・一括送信の準備
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border px-2 py-1 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              title="抽出対象"
            >
              <option value="all">すべて</option>
              <option value="form">フォーム入力可</option>
              <option value="email">メール送信可</option>
            </select>
            <select
              className="rounded-lg border px-2 py-1 text-sm"
              value={showSent}
              onChange={(e) => setShowSent(e.target.value as any)}
              title="送信済み表示"
            >
              <option value="unsent">未送信のみ</option>
              <option value="sent">送信済みのみ</option>
              <option value="all">すべて</option>
            </select>
          </div>
        </div>

        <section className="rounded-2xl border">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-neutral-50">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
                一覧をすべて選択
              </label>
              <span className="text-xs text-neutral-500">
                選択中: {sel.size} / 表示: {filtered.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
                onClick={openTemplateModal}
              >
                テンプレートを選択
              </button>
              <button
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
                disabled={!tplId || sel.size === 0}
                onClick={() => alert("確認モーダル→実送信は別実装")}
              >
                送信確認へ
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 w-10 text-left">選択</th>
                  <th className="px-3 py-3 text-left">会社名</th>
                  <th className="px-3 py-3 text-left">Web</th>
                  <th className="px-3 py-3 text-left">フォーム</th>
                  <th className="px-3 py-3 text-left">メール</th>
                  <th className="px-3 py-3 text-left">業種</th>
                  <th className="px-3 py-3 text-left">規模</th>
                  <th className="px-3 py-3 text-left">取得元</th>
                  <th className="px-3 py-3 text-left">送信済み</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isSent = sentIds.has(r.id);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          disabled={showSent === "unsent" && isSent}
                          checked={sel.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                        />
                      </td>
                      <td className="px-3 py-2">{r.company_name}</td>
                      <td className="px-3 py-2">
                        {r.website ? (
                          <a
                            className="text-sky-700 underline underline-offset-2"
                            href={r.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.website}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.contact_form_url ? (
                          <a
                            className="text-sky-700 underline underline-offset-2"
                            href={r.contact_form_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            開く
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">{r.contact_email ?? "-"}</td>
                      <td className="px-3 py-2">{r.industry ?? "-"}</td>
                      <td className="px-3 py-2">{r.company_size ?? "-"}</td>
                      <td className="px-3 py-2">{r.job_site_source ?? "-"}</td>
                      <td className="px-3 py-2">
                        <Toggle checked={isSent} onChange={() => {}} disabled />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-neutral-400"
                      colSpan={9}
                    >
                      対象がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
      </main>

      {/* テンプレ選択モーダル */}
      {openTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[880px] max-w-[96vw] rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">テンプレートを選択</div>
              <button
                className="rounded-lg border px-2 py-1 text-sm hover:bg-neutral-50"
                onClick={() => setOpenTpl(false)}
              >
                閉じる
              </button>
            </div>
            <div className="p-3 max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="px-3 py-2 w-10"></th>
                    <th className="px-3 py-2 text-left">名前</th>
                    <th className="px-3 py-2 text-left">件名</th>
                    <th className="px-3 py-2 text-left w-40">作成日時</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          type="radio"
                          name="tpl"
                          checked={tplId === t.id}
                          onChange={() => setTplId(t.id)}
                        />
                      </td>
                      <td className="px-3 py-2">{t.name}</td>
                      <td className="px-3 py-2">{t.subject ?? "-"}</td>
                      <td className="px-3 py-2">
                        {new Date(t.created_at).toLocaleString("ja-JP")}
                      </td>
                    </tr>
                  ))}
                  {templates.length === 0 && (
                    <tr>
                      <td
                        className="px-4 py-8 text-center text-neutral-400"
                        colSpan={4}
                      >
                        テンプレートがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
              <button
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
                onClick={() => setOpenTpl(false)}
              >
                決定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
