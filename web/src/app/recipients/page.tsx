// web/src/app/recipients/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Toggle from "@/components/Toggle";
import { PREFECTURES } from "@/constants/prefectures";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import { Pencil, Trash2 } from "lucide-react";
import { JobCategoriesCell } from "@/components/JobCategoriesCell"; // ← 追加

// 追加: メール設定ページで選択できるキー一覧
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

// 追加: 設定が未保存でも困らない初期表示(お好みで)
const DEFAULT_VISIBLE: RecipientColumnKey[] = [
  "name",
  "company_name",
  "job_categories",
  "email",
  "region",
  "created_at",
];

type Row = {
  id: string;
  name: string | null;
  company_name?: string | null; // ← 追加（APIが返せるなら）
  email: string | null;
  phone: string | null;
  gender: "male" | "female" | null;
  region: string | null;
  birthday: string | null;
  job_category_large: string | null;
  job_category_small: string | null;
  job_categories?: string[] | null; // ← あればここを使う
  is_active: boolean | null;
  consent: string | null;
  created_at?: string | null; // ← 追加（APIが返せるなら）
};

const safe = (v: any) => v ?? "";

function ageFromBirthday(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const y = +m[1],
    mm = +m[2] - 1,
    d = +m[3];
  const b = new Date(y, mm, d);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const mDiff = now.getMonth() - b.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : "";
}

function formatJob(large?: string | null, small?: string | null): string {
  const L = (large ?? "").trim();
  const S = (small ?? "").trim();
  if (L && S) return `${L}（${S}）`;
  if (L) return L;
  if (S) return S;
  return "";
}

export default function RecipientsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  // 追加: 可視列を設定テーブルから取得
  const [visible, setVisible] = useState<RecipientColumnKey[]>(DEFAULT_VISIBLE);
  const [loadingCols, setLoadingCols] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 既存の保存先に合わせてエンドポイントだけ調整（例: /api/email/recipient-list-settings）
        const res = await fetch("/api/email/recipient-list-settings", {
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json(); // { visible_columns: string[] }
          const cols = (j?.visible_columns ?? []) as RecipientColumnKey[];
          if (Array.isArray(cols) && cols.length) setVisible(cols);
        }
      } catch {}
      setLoadingCols(false);
    })();
  }, []);

  const [openFilter, setOpenFilter] = useState(false);
  const [q, setQ] = useState("");
  const [companyQ, setCompanyQ] = useState(""); // ← 会社名用
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
    const res = await fetch("/api/recipients/search?active=0");
    const j = await res.json();
    setRows(j?.rows ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      // 名前/メールの簡易全文検索は、どちらかが表示対象なら残す
      const enableTextSearch =
        visible.includes("name") || visible.includes("email");
      if (
        enableTextSearch &&
        q &&
        !(r.name ?? "").includes(q) &&
        !(r.email ?? "").includes(q)
      )
        return false;

      if (visible.includes("company_name") && companyQ) {
        if (!(r.company_name ?? "").includes(companyQ)) return false;
      }
      if (visible.includes("gender") && gender && r.gender !== (gender as any))
        return false;
      if (visible.includes("region") && pref && r.region !== pref) return false;

      if (visible.includes("job_categories")) {
        if (large && r.job_category_large !== large) return false;
        if (small && r.job_category_small !== small) return false;
      }

      if (visible.includes("age")) {
        const age = ageFromBirthday(r.birthday);
        if (ageMin && (age ? +age : -1) < +ageMin) return false;
        if (ageMax && (age ? +age : 999) > +ageMax) return false;
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

  // 設定未取得のチラつき抑制（任意）
  if (loadingCols) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              求職者リスト
            </h1>
            <p className="text-sm text-neutral-500">
              登録・編集・配信対象の管理
            </p>
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
              新規追加
            </Link>
          </div>
        </div>

        {/* フィルタ：選択された項目だけ出す */}
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
                        {large
                          ? "小カテゴリ: 指定なし"
                          : "大カテゴリを先に選択"}
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
                {visible.includes("name") && (
                  <th className="px-3 py-3 text-left">名前</th>
                )}
                {visible.includes("company_name") && (
                  <th className="px-3 py-3 text-left">会社名</th>
                )}
                {visible.includes("email") && (
                  <th className="px-3 py-3 text-left">メール</th>
                )}
                {visible.includes("phone") && (
                  <th className="px-3 py-3 text-left">電話</th>
                )}
                {visible.includes("gender") && (
                  <th className="px-3 py-3 text-center">性別</th>
                )}
                {visible.includes("age") && (
                  <th className="px-3 py-3 text-center">年齢</th>
                )}
                {visible.includes("region") && (
                  <th className="px-3 py-3 text-center">都道府県</th>
                )}
                {visible.includes("job_categories") && (
                  <th className="px-3 py-3 text-center">職種</th>
                )}
                {visible.includes("created_at") && (
                  <th className="px-3 py-3 text-center">作成日</th>
                )}
                {/* 常時表示 */}
                <th className="px-3 py-3 text-center">アクティブ</th>
                <th className="px-3 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                // 職種セルは job_categories[] があればそれを、無ければ大/小から生成して使う
                const jobItems =
                  r.job_categories && Array.isArray(r.job_categories)
                    ? r.job_categories
                    : ([r.job_category_large, r.job_category_small].filter(
                        Boolean
                      ) as string[]);

                return (
                  <tr key={r.id} className="border-t border-neutral-200">
                    {visible.includes("name") && (
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          <span>{safe(r.name)}</span>
                          {r.consent === "opt_out" && (
                            <span className="inline-block w-fit rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-600 whitespace-nowrap">
                              配信停止
                            </span>
                          )}
                        </div>
                      </td>
                    )}

                    {visible.includes("company_name") && (
                      <td className="px-3 py-3 text-neutral-600 whitespace-nowrap">
                        {safe(r.company_name)}
                      </td>
                    )}

                    {visible.includes("email") && (
                      <td className="px-3 py-3 text-neutral-600 whitespace-nowrap">
                        {safe(r.email)}
                      </td>
                    )}

                    {visible.includes("phone") && (
                      <td className="px-3 py-3 text-neutral-600 whitespace-nowrap">
                        {safe(r.phone)}
                      </td>
                    )}

                    {visible.includes("gender") && (
                      <td className="px-2.8 py-2.8 text-center text-neutral-600 whitespace-nowrap">
                        {r.gender === "male"
                          ? "男性"
                          : r.gender === "female"
                          ? "女性"
                          : ""}
                      </td>
                    )}

                    {visible.includes("age") && (
                      <td className="px-2.8 py-2.8 text-center text-neutral-600 whitespace-nowrap">
                        {ageFromBirthday(r.birthday)}
                      </td>
                    )}

                    {visible.includes("region") && (
                      <td className="px-2.8 py-2.8 text-center text-neutral-600 whitespace-nowrap">
                        {safe(r.region)}
                      </td>
                    )}

                    {visible.includes("job_categories") && (
                      <td className="px-2.8 py-2.8 text-center">
                        {/* 2件まで表示＋トグル */}
                        <JobCategoriesCell items={jobItems} />
                      </td>
                    )}

                    {visible.includes("created_at") && (
                      <td className="px-2.8 py-2.8 text-center text-neutral-600 whitespace-nowrap">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString()
                          : ""}
                      </td>
                    )}

                    {/* 常時表示 */}
                    <td className="px-2.2 py-2.2 text-center whitespace-nowrap">
                      <Toggle
                        checked={!!r.is_active}
                        onChange={(n) => toggleActive(r.id, n)}
                        label="active"
                      />
                    </td>
                    <td className="px-3.3 py-2.8 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/recipients/${r.id}/edit`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-200 hover:bg-neutral-50"
                          title="編集"
                          aria-label="編集"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">編集</span>
                        </Link>
                        <button
                          onClick={() => onDelete(r.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-200 text-red-600 hover:bg-red-50"
                          title="削除"
                          aria-label="削除"
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">削除</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={999}
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
}
