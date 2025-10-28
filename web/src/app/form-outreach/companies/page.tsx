"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Company = {
  id: string;
  company_name: string;
  source_site?: string | null;
  site_company_url?: string | null;
  official_website_url?: string | null;
  contact_form_url?: string | null;
  contact_email?: string | null;
  industry?: string | null;
  company_size?: string | null;
  job_site_source?: string | null; // フォールバック用
  created_at?: string | null;
};

export default function CompaniesPage() {
  const [rows, setRows] = useState<Company[]>([]);
  const [msg, setMsg] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // 列別フィルタ
  const [fCompany, setFCompany] = useState("");
  const [fIndustry, setFIndustry] = useState("");
  const [fSize, setFSize] = useState("");
  const [fSite, setFSite] = useState(""); // source_site / job_site_source
  const [fHasForm, setFHasForm] = useState<"" | "yes" | "no">("");
  const [fHasEmail, setFHasEmail] = useState<"" | "yes" | "no">("");

  const load = async () => {
    setMsg("");
    try {
      // 専用 API（companies）→ 無ければ prospects にフォールバック
      const r = await fetch("/api/form-outreach/companies", {
        headers: { "x-tenant-id": TENANT_ID },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
      setRows([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((c) => {
      if (
        fCompany &&
        !`${c.company_name}`.toLowerCase().includes(fCompany.toLowerCase())
      )
        return false;
      if (fIndustry && (c.industry || "") !== fIndustry) return false;
      if (fSize && (c.company_size || "") !== fSize) return false;

      const site = (c.source_site || c.job_site_source || "") as string;
      if (fSite && site !== fSite) return false;

      if (fHasForm === "yes" && !c.contact_form_url) return false;
      if (fHasForm === "no" && c.contact_form_url) return false;

      if (fHasEmail === "yes" && !c.contact_email) return false;
      if (fHasEmail === "no" && c.contact_email) return false;

      return true;
    });
  }, [rows, fCompany, fIndustry, fSize, fSite, fHasForm, fHasEmail]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              企業一覧
            </h1>
            <p className="text-sm text-neutral-500">
              薄い枠線に統一。列別フィルタはトグルで表示/非表示できます。
            </p>
          </div>
          <button
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? "フィルタを隠す" : "フィルタを表示"}
          </button>
        </div>

        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">会社名</th>
                  <th className="px-3 py-3 text-left">WEB</th>
                  <th className="px-3 py-3 text-left">フォーム</th>
                  <th className="px-3 py-3 text-left">メール</th>
                  <th className="px-3 py-3 text-left">業種</th>
                  <th className="px-3 py-3 text-left">規模</th>
                  <th className="px-3 py-3 text-left">サイト由来</th>
                  <th className="px-3 py-3 text-left">作成日時</th>
                </tr>
                {showFilters && (
                  <tr className="border-t border-neutral-200 bg-white">
                    <th className="px-3 py-2">
                      <input
                        className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                        placeholder="会社名で絞り込み"
                        value={fCompany}
                        onChange={(e) => setFCompany(e.target.value)}
                      />
                    </th>
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2">
                      <select
                        className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                        value={fHasForm}
                        onChange={(e) => setFHasForm(e.target.value as any)}
                      >
                        <option value="">（すべて）</option>
                        <option value="yes">あり</option>
                        <option value="no">なし</option>
                      </select>
                    </th>
                    <th className="px-3 py-2">
                      <select
                        className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                        value={fHasEmail}
                        onChange={(e) => setFHasEmail(e.target.value as any)}
                      >
                        <option value="">（すべて）</option>
                        <option value="yes">あり</option>
                        <option value="no">なし</option>
                      </select>
                    </th>
                    <th className="px-3 py-2">
                      <input
                        className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                        placeholder="業種"
                        value={fIndustry}
                        onChange={(e) => setFIndustry(e.target.value)}
                      />
                    </th>
                    <th className="px-3 py-2">
                      <select
                        className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                        value={fSize}
                        onChange={(e) => setFSize(e.target.value)}
                      >
                        <option value="">（すべて）</option>
                        <option value="小規模">小規模</option>
                        <option value="中規模">中規模</option>
                        <option value="大規模">大規模</option>
                      </select>
                    </th>
                    <th className="px-3 py-2">
                      <input
                        className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                        placeholder="サイト由来"
                        value={fSite}
                        onChange={(e) => setFSite(e.target.value)}
                      />
                    </th>
                    <th className="px-3 py-2"></th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/40">
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-900">
                        {c.company_name}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {c.site_company_url || c.official_website_url || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {c.official_website_url ? (
                        <a
                          href={c.official_website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline text-neutral-700"
                        >
                          公式
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {c.contact_form_url ? "あり" : "なし"}
                    </td>
                    <td className="px-3 py-2">{c.contact_email || "なし"}</td>
                    <td className="px-3 py-2">{c.industry || "-"}</td>
                    <td className="px-3 py-2">{c.company_size || "-"}</td>
                    <td className="px-3 py-2">
                      {c.source_site || c.job_site_source || "-"}
                    </td>
                    <td className="px-3 py-2">
                      {c.created_at?.replace("T", " ").replace("Z", "") || "-"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      会社がありません
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
    </>
  );
}
