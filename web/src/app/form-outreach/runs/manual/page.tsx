// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Prospect = {
  id: string;
  company_name: string;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  subject: string | null;
  channel: string | null;
  created_at: string | null;
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700">
      {children}
    </span>
  );
}

export default function ManualRunsPage() {
  const [pros, setPros] = useState<Prospect[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [msg, setMsg] = useState("");

  // フィルタ
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [channel, setChannel] = useState<"all" | "form" | "email">("all");

  // 選択状態
  const [selected, setSelected] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string>("");

  // テンプレ選択モーダル
  const [openTpl, setOpenTpl] = useState(false);

  const load = async () => {
    setMsg("");
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/form-outreach/prospects", {
          headers: { "x-tenant-id": TENANT_ID },
          cache: "no-store",
        }),
        fetch("/api/form-outreach/templates", {
          headers: { "x-tenant-id": TENANT_ID },
          cache: "no-store",
        }),
      ]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      if (!r1.ok) throw new Error(j1?.error || "prospects fetch failed");
      if (!r2.ok) throw new Error(j2?.error || "templates fetch failed");
      setPros(j1.rows ?? []);
      setTemplates(j2.rows ?? []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
      setPros([]);
      setTemplates([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return pros.filter((p) => {
      if (q) {
        const s = `${p.company_name} ${p.website ?? ""} ${
          p.contact_email ?? ""
        } ${p.industry ?? ""}`.toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      if (industry && p.industry !== industry) return false;
      if (size && p.company_size !== size) return false;

      // フィルタ（フォーム入力／メール送信／すべて）
      if (channel === "form" && !p.contact_form_url) return false;
      if (channel === "email" && !p.contact_email) return false;
      return true;
    });
  }, [pros, q, industry, size, channel]);

  const allChecked = selected.length > 0 && selected.length === filtered.length;
  const toggleAll = () => {
    if (allChecked) setSelected([]);
    else setSelected(filtered.map((p) => p.id));
  };
  const toggleOne = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );

  const selectedTemplate = templates.find((t) => t.id === templateId) || null;

  const runSend = async () => {
    if (!templateId) return alert("テンプレートを選択してください。");
    if (selected.length === 0) return alert("送信対象を選択してください。");
    // ここではダミー実行（実行 API がある場合は置き換えてください）
    alert(
      `テンプレ「${selectedTemplate?.name}」で ${selected.length} 件の送信をキューに積みます（ダミー）`
    );
  };

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
              会社一覧から送信対象を選び、テンプレートを指定して手動送信します。
            </p>
          </div>
        </div>

        {/* 操作パネル */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <input
              placeholder="検索（社名・URL・メール）"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">業種（すべて）</option>
              <option value="IT・ソフトウェア">IT・ソフトウェア</option>
              <option value="製造">製造</option>
              <option value="小売">小売</option>
              <option value="物流">物流</option>
              <option value="金融">金融</option>
              <option value="建設">建設</option>
              <option value="不動産">不動産</option>
              <option value="医療">医療</option>
              <option value="教育">教育</option>
              <option value="広告・出版">広告・出版</option>
            </select>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">規模（すべて）</option>
              <option value="小規模">小規模（〜50名）</option>
              <option value="中規模">中規模（51〜300名）</option>
              <option value="大規模">大規模（301名〜）</option>
            </select>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-600">送信方法:</span>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  checked={channel === "all"}
                  onChange={() => setChannel("all")}
                />
                すべて
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  checked={channel === "form"}
                  onChange={() => setChannel("form")}
                />
                フォーム入力
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  checked={channel === "email"}
                  onChange={() => setChannel("email")}
                />
                メール送信
              </label>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {selectedTemplate ? (
                <Pill>テンプレ: {selectedTemplate.name}</Pill>
              ) : (
                <Pill>テンプレ未選択</Pill>
              )}
              <button
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={() => setOpenTpl(true)}
              >
                テンプレートを選択
              </button>
              <button
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={runSend}
              >
                送信（ダミー）
              </button>
            </div>
          </div>
        </section>

        {/* 一覧 */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-b border-neutral-200">
            <div className="text-sm text-neutral-700">
              ヒット件数: {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                onClick={toggleAll}
              >
                {allChecked ? "全解除" : "全選択"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr className="border-b border-neutral-200">
                  <th className="px-3 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-3 text-left">会社名</th>
                  <th className="px-3 py-3 text-left">業種</th>
                  <th className="px-3 py-3 text-left">規模</th>
                  <th className="px-3 py-3 text-left">サイト由来</th>
                  <th className="px-3 py-3 text-left">フォーム</th>
                  <th className="px-3 py-3 text-left">メール</th>
                  <th className="px-3 py-3 text-left">送信済み</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtered.map((p) => {
                  const checked = selected.includes(p.id);
                  // 「送信済み」はトグルではなくテキスト表示
                  // status が 'sent' などなら「済」、それ以外は「未」
                  const sentText =
                    (p.status || "").toLowerCase().includes("sent") ||
                    (p.status || "").includes("送信")
                      ? "済"
                      : "未";
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50/40">
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(p.id)}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-neutral-900">
                          {p.company_name}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {p.website || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {p.industry || "-"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {p.company_size || "-"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {p.job_site_source || "-"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {p.contact_form_url ? "あり" : "なし"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {p.contact_email || "なし"}
                      </td>
                      <td className="px-3 py-2 align-top">{sentText}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      対象がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* テンプレート選択モーダル */}
        {openTpl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-[720px] max-w-[95vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div className="font-semibold">テンプレート選択</div>
                <button
                  onClick={() => setOpenTpl(false)}
                  className="rounded-lg px-2 py-1 border border-neutral-300 hover:bg-neutral-50 text-sm"
                >
                  閉じる
                </button>
              </div>
              <div className="p-3">
                <div className="rounded-xl border border-neutral-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="px-3 py-2 text-left">名称</th>
                        <th className="px-3 py-2 text-left">件名</th>
                        <th className="px-3 py-2 text-left">チャンネル</th>
                        <th className="px-3 py-2 text-left w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {templates.map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 py-2">{t.name}</td>
                          <td className="px-3 py-2">{t.subject || "-"}</td>
                          <td className="px-3 py-2">{t.channel || "-"}</td>
                          <td className="px-3 py-2">
                            <button
                              className="rounded-lg border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                              onClick={() => {
                                setTemplateId(t.id);
                                setOpenTpl(false);
                              }}
                            >
                              選択
                            </button>
                          </td>
                        </tr>
                      ))}
                      {templates.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-8 text-center text-neutral-400"
                          >
                            テンプレートがありません
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-neutral-200 text-xs text-neutral-500">
                form_outreach_messages から取得しています（テナント固定）。
              </div>
            </div>
          </div>
        )}

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
