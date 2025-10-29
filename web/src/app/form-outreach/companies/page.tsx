// web/src/app/form-outreach/companies/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Company = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null; // ← form_prospects.website を使う
  contact_form_url: string | null;
  contact_email: string | null;
  source_site: string | null; // 表示のみ（フィルタは削除）
  created_at: string | null; // 取得日時
};

function ellipsizeUrl(u: string, max = 54) {
  if (!u) return "";
  if (u.length <= max) return u;
  const head = Math.max(0, Math.floor((max - 1) * 0.65));
  const tail = Math.max(0, max - 1 - head);
  return `${u.slice(0, head)}…${u.slice(-tail)}`;
}

export default function CompaniesPage() {
  const [rows, setRows] = useState<Company[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // 独立フィルタ
  const [showFilters, setShowFilters] = useState(true);
  const [q, setQ] = useState("");
  const [formFilter, setFormFilter] = useState<"" | "has" | "none">(""); // ★ 追加
  const [emailFilter, setEmailFilter] = useState<"" | "has" | "none">("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sortKey, setSortKey] = useState<"created_at" | "company_name">(
    "created_at"
  );
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

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
    const df = dateFrom ? new Date(dateFrom) : null;
    const dt = dateTo ? new Date(dateTo) : null;

    let arr = rows.filter((r) => {
      if (qq) {
        const hit =
          (r.company_name || "").toLowerCase().includes(qq) ||
          (r.website || "").toLowerCase().includes(qq) ||
          (r.contact_email || "").toLowerCase().includes(qq);
        if (!hit) return false;
      }
      // ★ フォーム有無
      if (formFilter === "has" && !(r.contact_form_url || "").trim())
        return false;
      if (formFilter === "none" && (r.contact_form_url || "").trim())
        return false;

      // メール有無
      if (emailFilter === "has" && !(r.contact_email || "").trim())
        return false;
      if (emailFilter === "none" && (r.contact_email || "").trim())
        return false;

      // 取得日時
      if (df || dt) {
        const created = r.created_at ? new Date(r.created_at) : null;
        if (!created) return false;
        if (df && created < df) return false;
        if (dt) {
          const end = new Date(dt);
          end.setHours(23, 59, 59, 999);
          if (created > end) return false;
        }
      }
      return true;
    });

    arr.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "created_at") {
        av = a.created_at || "";
        bv = b.created_at || "";
      } else {
        av = (a.company_name || "").toLowerCase();
        bv = (b.company_name || "").toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, q, formFilter, emailFilter, dateFrom, dateTo, sortKey, sortDir]);

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
      setMsg(`取り込み: 追加 ${j.inserted ?? 0} / スキップ ${j.skipped ?? 0}`);
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
              列・フィルタを整理（フォーム有無追加／サイトURLは website
              を表示／取得日時でソート可）
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
            >
              {loading ? "取得中…" : "今すぐ企業リストを取得"}
            </button>
          </div>
        </div>

        {showFilters && (
          <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-neutral-600">キーワード</div>
                <input
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="社名・URL・メールで検索"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              {/* ★ フォーム有無 */}
              <div>
                <div className="mb-1 text-xs text-neutral-600">
                  フォーム有無
                </div>
                <select
                  className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                  value={formFilter}
                  onChange={(e) => setFormFilter(e.target.value as any)}
                >
                  <option value="">（指定なし）</option>
                  <option value="has">あり</option>
                  <option value="none">なし</option>
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
                <div className="mb-1 text-xs text-neutral-600">
                  取得日時(From)
                </div>
                <input
                  type="date"
                  className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-600">
                  取得日時(To)
                </div>
                <input
                  type="date"
                  className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-neutral-600">並び替え</div>
                <div className="flex gap-2">
                  <select
                    className="rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as any)}
                  >
                    <option value="created_at">取得日時</option>
                    <option value="company_name">社名</option>
                  </select>
                  <select
                    className="rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                    value={sortDir}
                    onChange={(e) => setSortDir(e.target.value as any)}
                  >
                    <option value="desc">降順</option>
                    <option value="asc">昇順</option>
                  </select>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">社名</th>
                <th className="px-3 py-3 text-left">サイトURL</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">取得元</th>
                <th className="px-3 py-3 text-left">取得日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.company_name || "-"}</td>
                  <td className="px-3 py-2">
                    {c.website ? (
                      <a
                        href={c.website}
                        target="_blank"
                        className="text-indigo-700 hover:underline break-all"
                      >
                        {ellipsizeUrl(c.website)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">{c.contact_email || "-"}</td>
                  <td className="px-3 py-2">{c.source_site || "-"}</td>
                  <td className="px-3 py-2">
                    {c.created_at
                      ? c.created_at.replace("T", " ").replace("Z", "")
                      : "-"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
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
