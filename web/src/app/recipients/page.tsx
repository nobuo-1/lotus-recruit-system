// web/src/app/recipients/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Toggle from "@/components/Toggle";
import { PREFECTURES } from "@/constants/prefectures";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import { Pencil, Trash2 } from "lucide-react";
import { JobCategoriesCell } from "@/components/JobCategoriesCell";

type RecipientColumnKey =
  | "name"
  | "company_name"
  | "job_categories"
  | "gender"
  | "age"
  | "created_at"
  | "email"
  | "region"
  | "phone";

const DEFAULT_VISIBLE: RecipientColumnKey[] = [
  "name",
  "company_name",
  "job_categories",
  "email",
  "region",
  "created_at",
];

// ◆ 表示順（選択されている列だけ、この順番で表示）
const DISPLAY_ORDER: RecipientColumnKey[] = [
  "name",
  "company_name",
  "email",
  "phone",
  "age",
  "gender",
  "region",
  "job_categories",
  "created_at",
];

type Row = {
  id: string;
  name: string | null;
  company_name?: string | null;
  email: string | null;
  phone: string | null;
  gender: "male" | "female" | null;
  region: string | null;
  birthday: string | null;

  // 後方互換の単一ペア
  job_category_large: string | null;
  job_category_small: string | null;

  // 複数職種（API で返る想定）
  job_categories?: Array<string | { large?: unknown; small?: unknown }> | null;

  is_active: boolean | null;
  consent: string | null;
  created_at?: string | null;
};

const safe = (v: any) => v ?? "";

// どんな値でも安全に文字列へ（.trim対策）
const toText = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === "string");
    return typeof s === "string" ? s : "";
  }
  if (v == null) return "";
  try {
    return String(v);
  } catch {
    return "";
  }
};

// 職種配列を「表示用の文字列配列」に正規化
const normalizeJobs = (r: Row): string[] => {
  const toS = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (Array.isArray(r.job_categories) && r.job_categories.length) {
    return r.job_categories
      .map((it) => {
        if (typeof it === "string") return toS(it);
        if (it && typeof it === "object") {
          const L = toS((it as any).large);
          const S = toS((it as any).small);
          return L && S ? `${L}（${S}）` : L || S || "";
        }
        return "";
      })
      .filter(Boolean);
  }

  // 後方互換（単一フィールドから作成）
  const L = toS(r.job_category_large);
  const S = toS(r.job_category_small);
  return L || S ? [L && S ? `${L}（${S}）` : L || S] : [];
};

export default function RecipientsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  const [visible, setVisible] = useState<RecipientColumnKey[]>(DEFAULT_VISIBLE);
  const [loadingCols, setLoadingCols] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/recipient-list-settings", {
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json();
          const cols = (j?.visible_columns ?? []) as RecipientColumnKey[];
          if (Array.isArray(cols) && cols.length) setVisible(cols);
        }
      } catch {}
      setLoadingCols(false);
    })();
  }, []);

  // フィルタ
  const [openFilter, setOpenFilter] = useState(false);
  const [q, setQ] = useState("");
  const [companyQ, setCompanyQ] = useState("");
  const [ageMin, setAgeMin] = useState<string>("");
  const [ageMax, setAgeMax] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [pref, setPref] = useState<string>("");
  const [large, setLarge] = useState<string>("");
  const [small, setSmall] = useState<string>("");

  const smallOptions = useMemo(
    () => (large ? JOB_CATEGORIES[large] ?? [] : []),
    [large]
  );

  const load = async () => {
    try {
      const res = await fetch("/api/recipients/search?active=0", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/recipients/search ${res.status}`);
      const j = await res.json();
      setRows(j?.rows ?? []);
      setMsg("");
    } catch (e: any) {
      console.error(e);
      setRows([]);
      setMsg(String(e?.message || e));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const enableTextSearch =
        visible.includes("name") || visible.includes("email");
      if (
        enableTextSearch &&
        q &&
        !toText(r.name).includes(q) &&
        !toText(r.email).includes(q)
      )
        return false;

      if (
        visible.includes("company_name") &&
        companyQ &&
        !toText(r.company_name).includes(companyQ)
      )
        return false;

      if (visible.includes("gender") && gender && r.gender !== (gender as any))
        return false;

      if (visible.includes("region") && pref && toText(r.region) !== pref)
        return false;

      if (visible.includes("job_categories")) {
        // 単一ペアでの絞り込み（複数職種があってもメイン1組で）
        if (large && toText(r.job_category_large) !== large) return false;
        if (small && toText(r.job_category_small) !== small) return false;
      }

      if (visible.includes("age")) {
        const b = toText(r.birthday);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b);
        let age = -1;
        if (m) {
          const y = +m[1],
            mm = +m[2] - 1,
            d = +m[3];
          const bd = new Date(y, mm, d);
          const now = new Date();
          age = now.getFullYear() - bd.getFullYear();
          const diffM = now.getMonth() - bd.getMonth();
          if (diffM < 0 || (diffM === 0 && now.getDate() < bd.getDate())) age--;
        }
        if (ageMin && age < +ageMin) return false;
        if (ageMax && (age === -1 ? 999 : age) > +ageMax) return false;
      }

      return true;
    });
  }, [rows, q, companyQ, gender, pref, large, small, ageMin, ageMax, visible]);

  const toggleActive = async (id: string, next: boolean) => {
    const res = await fetch("/api/recipients/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, is_active: next }),
    });
    const t = await res.text();
    setMsg(`${res.status}: ${t}`);
    if (res.ok) load();
  };

  const onDelete = async (id: string) => {
    if (!confirm("この求職者を削除します。よろしいですか？")) return;
    const res = await fetch("/api/recipients/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const t = await res.text();
    setMsg(`${res.status}: ${t}`);
    if (res.ok) load();
  };

  const clearFilters = () => {
    setQ("");
    setCompanyQ("");
    setAgeMin("");
    setAgeMax("");
    setGender("");
    setPref("");
    setLarge("");
    setSmall("");
  };

  if (loadingCols) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <h1 className="text-2xl font-semibold">受信者リスト</h1>
        <p className="text-sm text-neutral-500">読み込み中…</p>
      </main>
    );
  }

  // ◆ 選択済み列を、表示順に並べ替えた配列
  const orderedVisible = DISPLAY_ORDER.filter((k) => visible.includes(k));

  const HEADERS: Record<RecipientColumnKey, string> = {
    name: "名前",
    company_name: "会社名",
    job_categories: "職種",
    gender: "性別",
    age: "年齢",
    created_at: "作成日",
    email: "メール",
    region: "都道府県",
    phone: "電話",
  };

  const renderCell = (k: RecipientColumnKey, r: Row) => {
    switch (k) {
      case "name":
        return (
          <div className="flex flex-col gap-1">
            <span>{safe(toText(r.name))}</span>
            {r.consent === "opt_out" && (
              <span className="inline-block w-fit rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-600">
                配信停止
              </span>
            )}
          </div>
        );
      case "company_name":
        return (
          <span className="text-neutral-700">
            {safe(toText(r.company_name))}
          </span>
        );
      case "job_categories": {
        const items = normalizeJobs(r); // すべて文字列に正規化

        return <JobCategoriesCell items={items} />;
      }
      case "gender":
        return (
          <span className="whitespace-nowrap">
            {r.gender === "male" ? "男性" : r.gender === "female" ? "女性" : ""}
          </span>
        );
      case "age":
        return (
          <span className="whitespace-nowrap">
            {(() => {
              const b = toText(r.birthday);
              const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b);
              if (!m) return "";
              const y = +m[1],
                mm = +m[2] - 1,
                d = +m[3];
              const bd = new Date(y, mm, d);
              const now = new Date();
              let age = now.getFullYear() - bd.getFullYear();
              const diffM = now.getMonth() - bd.getMonth();
              if (diffM < 0 || (diffM === 0 && now.getDate() < bd.getDate()))
                age--;
              return age >= 0 && age < 130 ? String(age) : "";
            })()}
          </span>
        );
      case "created_at":
        return (
          <span className="whitespace-nowrap">
            {r.created_at?.slice(0, 10) ?? ""}
          </span>
        );
      case "email":
        return (
          <span className="whitespace-nowrap text-neutral-600">
            {safe(toText(r.email))}
          </span>
        );
      case "region":
        return (
          <span className="whitespace-nowrap text-neutral-600">
            {safe(toText(r.region))}
          </span>
        );
      case "phone":
        return (
          <span className="whitespace-nowrap text-neutral-600">
            {safe(toText(r.phone))}
          </span>
        );
    }
  };

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            受信者リスト
          </h1>
          <p className="text-sm text-neutral-500">登録・編集・配信対象の管理</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/email"
            className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            メール配信トップ
          </Link>
          <Link
            href="/recipients/new"
            className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            受信者リスト新規追加
          </Link>
        </div>
      </div>

      {/* フィルタ（選択された項目のみ表示） */}
      <div className="mb-3 rounded-2xl border border-neutral-200">
        <button
          type="button"
          aria-expanded={openFilter}
          onClick={() => setOpenFilter((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm text-neutral-700">フィルター</span>
          <span
            className={`inline-block text-neutral-500 transition-transform ${
              openFilter ? "rotate-180" : ""
            }`}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {openFilter && (
          <div className="border-t border-neutral-200 px-4 py-4">
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {(visible.includes("name") || visible.includes("email")) && (
                <input
                  placeholder="名前/メールで検索"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2"
                />
              )}

              {visible.includes("company_name") && (
                <input
                  placeholder="会社名"
                  value={companyQ}
                  onChange={(e) => setCompanyQ(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2"
                />
              )}

              {visible.includes("age") && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="年齢(最小)"
                    value={ageMin}
                    onChange={(e) => setAgeMin(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="年齢(最大)"
                    value={ageMax}
                    onChange={(e) => setAgeMax(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                  />
                </div>
              )}

              {visible.includes("gender") && (
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2"
                >
                  <option value="">性別: 指定なし</option>
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                </select>
              )}

              {visible.includes("job_categories") && (
                <>
                  <select
                    value={large}
                    onChange={(e) => {
                      setLarge(e.target.value);
                      setSmall("");
                    }}
                    className="rounded-lg border border-neutral-300 px-3 py-2"
                  >
                    <option value="">大カテゴリ: 指定なし</option>
                    {JOB_LARGE.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={small}
                    onChange={(e) => setSmall(e.target.value)}
                    disabled={!large}
                    className="rounded-lg border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
                  >
                    <option value="">
                      {large ? "小カテゴリ: 指定なし" : "大カテゴリを先に選択"}
                    </option>
                    {(large ? smallOptions : []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {visible.includes("region") && (
                <select
                  value={pref}
                  onChange={(e) => setPref(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2"
                >
                  <option value="">都道府県: 指定なし</option>
                  {PREFECTURES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                条件クリア
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-[1080px] w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              {orderedVisible.map((c) => (
                <th
                  key={c}
                  className={`px-3 py-3 ${
                    c === "gender" ||
                    c === "age" ||
                    c === "region" ||
                    c === "job_categories" ||
                    c === "created_at"
                      ? "text-center"
                      : "text-left"
                  }`}
                >
                  {HEADERS[c]}
                </th>
              ))}
              <th className="px-3 py-3 text-center">アクティブ</th>
              <th className="px-3 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200">
                {orderedVisible.map((c) => (
                  <td
                    key={c}
                    className={`px-3 py-3 ${
                      c === "gender" ||
                      c === "age" ||
                      c === "region" ||
                      c === "job_categories" ||
                      c === "created_at"
                        ? "text-center"
                        : "text-left"
                    } align-top`}
                  >
                    {renderCell(c, r)}
                  </td>
                ))}

                <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                  <Toggle
                    checked={!!r.is_active}
                    onChange={(n) => toggleActive(r.id, n)}
                    label="active"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link
                      href={`/recipients/${r.id}/edit`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-200 hover:bg-neutral-50"
                      title="編集"
                    >
                      <Pencil className="h-3 w-3" />
                    </Link>
                    <button
                      onClick={() => onDelete(r.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-200 text-red-600 hover:bg-red-50"
                      title="削除"
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={orderedVisible.length + 2}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
    </main>
  );
}
