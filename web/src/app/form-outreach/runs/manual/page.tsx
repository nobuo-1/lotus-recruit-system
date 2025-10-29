"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Prospect = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  status: string | null; // 送信済み等の状態が入る想定
  created_at: string | null;
};

type TemplateRow = {
  id: string;
  name: string | null;
  subject: string | null;
  channel: string | null;
  created_at: string | null;
};

export default function ManualRuns() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [msg, setMsg] = useState("");

  // フィルタ
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [channel, setChannel] = useState<"all" | "form" | "email">("all"); // 「すべて」を追加
  const [showSent, setShowSent] = useState(false); // false=未送信のみ、true=送信済みのみ

  useEffect(() => {
    const load = async () => {
      setMsg("");
      try {
        const [rp, rt] = await Promise.all([
          fetch("/api/form-outreach/prospects", {
            headers: { "x-tenant-id": TENANT_ID },
            cache: "no-store",
          }),
          fetch("/api/form-outreach/templates", {
            headers: { "x-tenant-id": TENANT_ID },
            cache: "no-store",
          }),
        ]);
        const jp = await rp.json();
        const jt = await rt.json();
        if (!rp.ok) throw new Error(jp?.error || "prospects fetch failed");
        if (!rt.ok) throw new Error(jt?.error || "templates fetch failed");
        setProspects(jp.rows ?? []);
        setTemplates(jt.rows ?? []);
      } catch (e: any) {
        setMsg(String(e?.message || e));
        setProspects([]);
        setTemplates([]);
      }
    };
    load();
  }, []);

  // 表と連動したフィルタ
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return prospects.filter((p) => {
      if (qq) {
        const hit =
          (p.company_name || "").toLowerCase().includes(qq) ||
          (p.website || "").toLowerCase().includes(qq) ||
          (p.contact_email || "").toLowerCase().includes(qq);
        if (!hit) return false;
      }
      if (industry && (p.industry || "") !== industry) return false;
      if (size && (p.company_size || "") !== size) return false;

      // チャンネル条件
      if (channel === "form" && !(p.contact_form_url || "").trim())
        return false;
      if (channel === "email" && !(p.contact_email || "").trim()) return false;

      // 送信済み/未送信の切り替え（status に "sent" 等が入る想定）
      if (!showSent) {
        // 未送信のみ表示
        if ((p.status || "").toLowerCase().includes("sent")) return false;
      } else {
        // 送信済みのみ表示
        if (!(p.status || "").toLowerCase().includes("sent")) return false;
      }
      return true;
    });
  }, [prospects, q, industry, size, channel, showSent]);

  // 一括選択（必要であれば拡張）
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allChecked =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              手動実行
            </h1>
            <p className="text-sm text-neutral-500">
              フィルタは表と完全連動。「すべて/フォーム/メール」切替に対応
            </p>
          </div>
          <Link
            href="/form-outreach/templates"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            テンプレート管理へ
          </Link>
        </div>

        {/* フィルタ（薄い枠線） */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-neutral-600">キーワード</div>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="社名・URL・メール"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">業種</div>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="例: IT・小売 など（完全一致）"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">企業規模</div>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="例: 小規模/中規模/大規模"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">チャンネル</div>
              <select
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value as any)}
              >
                <option value="all">すべて</option>
                <option value="form">フォーム入力</option>
                <option value="email">メール送信</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-600">表示対象</div>
              <select
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                value={showSent ? "sent" : "unsent"}
                onChange={(e) => setShowSent(e.target.value === "sent")}
              >
                <option value="unsent">未送信のみ</option>
                <option value="sent">送信済みのみ</option>
              </select>
            </div>
          </div>
        </section>

        {/* テンプレ選択（モーダルにしない軽量版の例。既存モーダルがある場合はそちらのデータ供給に合わせてください） */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-3">
          <div className="mb-2 text-sm text-neutral-700">テンプレート選択</div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-700"
                title={`${t.name || "-"} / ${t.channel || "-"}`}
              >
                {t.name || "-"}
              </span>
            ))}
            {templates.length === 0 && (
              <div className="text-xs text-neutral-500">
                テンプレートがありません
              </div>
            )}
          </div>
        </section>

        {/* 表（送信済み列は文字表示） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-3 text-left">社名</th>
                <th className="px-3 py-3 text-left">サイトURL</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">業種</th>
                <th className="px-3 py-3 text-left">企業規模</th>
                <th className="px-3 py-3 text-left">送信状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filtered.map((p) => {
                const sent = (p.status || "").toLowerCase().includes("sent");
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                      />
                    </td>
                    <td className="px-3 py-2">{p.company_name || "-"}</td>
                    <td className="px-3 py-2">
                      {p.website ? (
                        <a
                          href={p.website}
                          target="_blank"
                          className="text-indigo-700 hover:underline break-all"
                        >
                          {p.website}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2">{p.contact_email || "-"}</td>
                    <td className="px-3 py-2">{p.industry || "-"}</td>
                    <td className="px-3 py-2">{p.company_size || "-"}</td>
                    <td className="px-3 py-2">
                      {sent ? "送信済み" : "未送信"}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    対象がありません
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
      </main>
    </>
  );
}
