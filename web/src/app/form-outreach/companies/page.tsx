"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Company = {
  id: string;
  tenant_id: string | null;
  source_site: string | null;
  company_name: string | null;
  site_company_url: string | null;
  official_website_url: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  is_blocked: boolean | null;
  last_checked_at: string | null;
  created_at: string | null;
};

export default function CompaniesPage() {
  const [rows, setRows] = useState<Company[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // フィルタ（表とは独立）
  const [showFilters, setShowFilters] = useState(true);
  const [q, setQ] = useState("");
  const [site, setSite] = useState<string>("");
  const [emailFilter, setEmailFilter] = useState<"" | "has" | "none">("");
  const [blocked, setBlocked] = useState<"" | "true" | "false">("");

  const load = async () => {
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/companies", {
        headers: { "x-tenant-id": TENANT_ID },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
    } catch (e: any) {
      setRows([]);
      setMsg(String(e?.message || e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (qq) {
        const hit =
          (r.company_name || "").toLowerCase().includes(qq) ||
          (r.official_website_url || "").toLowerCase().includes(qq) ||
          (r.contact_email || "").toLowerCase().includes(qq);
        if (!hit) return false;
      }
      if (site && (r.source_site || "") !== site) return false;
      if (emailFilter === "has" && !(r.contact_email || "").trim())
        return false;
      if (emailFilter === "none" && (r.contact_email || "").trim())
        return false;
      if (blocked === "true" && !r.is_blocked) return false;
      if (blocked === "false" && r.is_blocked) return false;
      return true;
    });
  }, [rows, q, site, emailFilter, blocked]);

  const fetchNow = async () => {
    if (loading) return;
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/companies/fetch-now", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch-now failed");
      await load();
      setMsg(
        `取り込み完了: 追加 ${j.inserted ?? 0} 件 / スキップ ${
          j.skipped ?? 0
        } 件`
      );
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              企業一覧
            </h1>
            <p className="text-sm text-neutral-500">
              form_outreach_companies を表示。フィルタは表とは独立して配置。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              {showFilters ? "フィルタを隠す" : "フィルタを表示"}
            </button>
            <button
              onClick={fetchNow}
              disabled={loading}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              title="form_prospects から差分取り込み"
            >
              {loading ? "取得中…" : "今すぐ企業リストを取得"}
            </button>
          </div>
        </div>

        {/* 独立フィルタパネル */}
        {showFilters && (
          <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <div className="mb-1 text-xs text-neutral-600">キーワード</div>
                <input
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="社名・URL・メールで検索"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-600">
                  取得元サイト
                </div>
                <select
                  className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                >
                  <option value="">（指定なし）</option>
                  <option value="mynavi">マイナビ</option>
                  <option value="doda">doda</option>
                  <option value="type">type</option>
                  <option value="womantype">女の転職type</option>
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-600">メール有無</div>
                <select
                  className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value as any)}
                >
                  <option value="">（指定なし）</option>
                  <option value="has">あり</option>
                  <option value="none">なし</option>
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-600">ブロック</div>
                <select
                  className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                  value={blocked}
                  onChange={(e) => setBlocked(e.target.value as any)}
                >
                  <option value="">（指定なし）</option>
                  <option value="false">ブロック解除のみ</option>
                  <option value="true">ブロックのみ</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {/* 表本体（薄い枠線で統一） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">社名</th>
                <th className="px-3 py-3 text-left">サイトURL</th>
                <th className="px-3 py-3 text-left">公式サイト</th>
                <th className="px-3 py-3 text-left">フォーム</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">取得元</th>
                <th className="px-3 py-3 text-left">ブロック</th>
                <th className="px-3 py-3 text-left">最終チェック</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.company_name || "-"}</td>
                  <td className="px-3 py-2">
                    {c.site_company_url ? (
                      <a
                        href={c.site_company_url}
                        target="_blank"
                        className="text-indigo-700 hover:underline"
                      >
                        開く
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {c.official_website_url ? (
                      <a
                        href={c.official_website_url}
                        target="_blank"
                        className="text-indigo-700 hover:underline"
                      >
                        開く
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {c.contact_form_url ? (
                      <a
                        href={c.contact_form_url}
                        target="_blank"
                        className="text-indigo-700 hover:underline"
                      >
                        開く
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">{c.contact_email || "-"}</td>
                  <td className="px-3 py-2">{c.source_site || "-"}</td>
                  <td className="px-3 py-2">
                    {c.is_blocked ? "ブロック中" : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {c.last_checked_at
                      ? c.last_checked_at.replace("T", " ").replace("Z", "")
                      : "-"}
                  </td>
                </tr>
              ))}
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
