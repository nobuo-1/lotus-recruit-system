// web/src/app/form-outreach/companies/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

type Company = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  prefectures: string[] | null;
  job_site_source: string | null;
  created_at: string | null;
};

function ellipsizeUrl(u: string, max = 54) {
  if (!u) return "";
  if (u.length <= max) return u;
  const head = Math.max(0, Math.floor((max - 1) * 0.65));
  const tail = Math.max(0, max - 1 - head);
  return `${u.slice(0, head)}…${u.slice(-tail)}`;
}

const SIZE_OPTS = ["1-9", "10-49", "50-249", "250+"] as const;

export default function CompaniesPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<Company[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // フィルタ
  const [showFilters, setShowFilters] = useState(true);
  const [q, setQ] = useState("");
  const [formFilter, setFormFilter] = useState<"" | "has" | "none">("");
  const [emailFilter, setEmailFilter] = useState<"" | "has" | "none">("");
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);
  const [prefFilter, setPrefFilter] = useState<string>(""); // カンマ区切り
  const [industryQ, setIndustryQ] = useState<string>("");

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sortKey, setSortKey] = useState<"created_at" | "company_name">(
    "created_at"
  );
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const load = async () => {
    setMsg("");
    try {
      let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
      if (!meRes.ok)
        meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
      const me = await meRes.json().catch(() => ({}));
      const tId = me?.tenant_id ?? me?.profile?.tenant_id ?? null;
      setTenantId(tId);

      const r = await fetch("/api/form-outreach/companies", {
        headers: tId ? { "x-tenant-id": String(tId) } : undefined,
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
    const prefList = prefFilter
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    let arr = rows.filter((r) => {
      if (qq) {
        const hit =
          (r.company_name || "").toLowerCase().includes(qq) ||
          (r.website || "").toLowerCase().includes(qq) ||
          (r.contact_email || "").toLowerCase().includes(qq);
        if (!hit) return false;
      }
      if (formFilter === "has" && !(r.contact_form_url || "").trim())
        return false;
      if (formFilter === "none" && (r.contact_form_url || "").trim())
        return false;

      if (emailFilter === "has" && !(r.contact_email || "").trim())
        return false;
      if (emailFilter === "none" && (r.contact_email || "").trim())
        return false;

      if (
        sizeFilter.length &&
        (!r.company_size || !sizeFilter.includes(r.company_size))
      )
        return false;

      if (prefList.length) {
        const set = new Set((r.prefectures || []).map(String));
        const ok = prefList.some((p) => set.has(p));
        if (!ok) return false;
      }

      if (industryQ.trim()) {
        const iq = industryQ.trim().toLowerCase();
        if (!(r.industry || "").toLowerCase().includes(iq)) return false;
      }

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
  }, [
    rows,
    q,
    formFilter,
    emailFilter,
    sizeFilter,
    prefFilter,
    industryQ,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
  ]);

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
              新しい列とフィルタを追加（フォーム有無／規模／都道府県／業種）
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              {showFilters ? "フィルタを隠す" : "フィルタを表示"}
            </button>
            <Link
              href="/form-outreach/companies/fetch"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              title="手動で企業リストを取得"
            >
              企業リスト手動取得
            </Link>
          </div>
        </div>

        {showFilters && (
          <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-8">
              <div className="md:col-span-2">
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

              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-neutral-600">従業員規模</div>
                <div className="flex flex-wrap gap-2">
                  {SIZE_OPTS.map((opt) => {
                    const on = sizeFilter.includes(opt);
                    return (
                      <label
                        key={opt}
                        className={`text-xs inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${
                          on
                            ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                            : "border-neutral-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) =>
                            setSizeFilter((arr) =>
                              e.target.checked
                                ? [...arr, opt]
                                : arr.filter((x) => x !== opt)
                            )
                          }
                        />
                        {opt}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-neutral-600">
                  都道府県（カンマ区切り）
                </div>
                <input
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="例: 大阪府, 東京都"
                  value={prefFilter}
                  onChange={(e) => setPrefFilter(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-neutral-600">
                  業種（あいまい検索）
                </div>
                <input
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="例: SaaS / 受託 / 製造"
                  value={industryQ}
                  onChange={(e) => setIndustryQ(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
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
              <div className="md:col-span-2">
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
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">社名</th>
                <th className="px-3 py-3 text-left">サイトURL</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">フォーム</th>
                <th className="px-3 py-3 text-left">規模</th>
                <th className="px-3 py-3 text-left">都道府県</th>
                <th className="px-3 py-3 text-left">業種</th>
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
                  <td className="px-3 py-2">
                    {c.contact_form_url ? (
                      <a
                        href={c.contact_form_url}
                        target="_blank"
                        className="text-indigo-700 hover:underline"
                      >
                        あり
                      </a>
                    ) : (
                      "なし"
                    )}
                  </td>
                  <td className="px-3 py-2">{c.company_size || "-"}</td>
                  <td className="px-3 py-2">
                    {Array.isArray(c.prefectures) && c.prefectures.length
                      ? c.prefectures.join(" / ")
                      : "-"}
                  </td>
                  <td className="px-3 py-2">{c.industry || "-"}</td>
                  <td className="px-3 py-2">{c.job_site_source || "-"}</td>
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
                    colSpan={9}
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
