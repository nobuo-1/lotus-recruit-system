// web/src/app/recipients/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Toggle from "@/components/Toggle";
import { PREFECTURES } from "@/constants/prefectures";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import { Pencil, Trash2 } from "lucide-react"; // ← 追加

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  gender: "male" | "female" | null;
  region: string | null;
  birthday: string | null; // YYYY-MM-DD | null
  job_category_large: string | null;
  job_category_small: string | null;
  job_type: string | null;
  is_active: boolean | null;
  consent: string | null; // 'opt_out' のとき配信停止申請
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

/** 職種表示：両方あり→ 大（小）／片方のみ→ そのまま／両方なし→ 空 */
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

  // フィルタ（配信先ページ相当）
  const [openFilter, setOpenFilter] = useState(false); // ← トグル“形式”（スイッチではなく開閉）
  const [q, setQ] = useState("");
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
      if (q && !(r.name ?? "").includes(q) && !(r.email ?? "").includes(q))
        return false;
      if (gender && r.gender !== (gender as any)) return false;
      if (pref && r.region !== pref) return false;
      if (large && r.job_category_large !== large) return false;
      if (small && r.job_category_small !== small) return false;
      const age = ageFromBirthday(r.birthday);
      if (ageMin && (age ? +age : -1) < +ageMin) return false;
      if (ageMax && (age ? +age : 999) > +ageMax) return false;
      return true;
    });
  }, [rows, q, gender, pref, large, small, ageMin, ageMax]);

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
    setAgeMin("");
    setAgeMax("");
    setGender("");
    setPref("");
    setLarge("");
    setSmall("");
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            求職者リスト
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
            新規追加
          </Link>
        </div>
      </div>

      {/* フィルタ：トグル“形式”（開閉できるヘッダ行） */}
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
              <input
                placeholder="名前/メールで検索"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2"
              />
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
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2"
              >
                <option value="">性別: 指定なし</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
              </select>

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
              <th className="px-3 py-3 text-left">名前</th>
              <th className="px-3 py-3 text-left">メール</th>
              <th className="px-3 py-3 text-left">電話</th>
              <th className="px-3 py-3 text-center">性別</th>
              <th className="px-3 py-3 text-center">年齢</th>
              <th className="px-3 py-3 text-center">都道府県</th>
              <th className="px-3 py-3 text-center">職種</th>
              <th className="px-3 py-3 text-center">アクティブ</th>
              <th className="px-3 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200">
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-col gap-1">
                    <span>{safe(r.name)}</span>
                    {r.consent === "opt_out" && (
                      <span className="inline-block w-fit rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-600">
                        配信停止
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-neutral-600">{safe(r.email)}</td>
                <td className="px-3 py-3 text-neutral-600">{safe(r.phone)}</td>
                <td className="px-2.8 py-2.8 text-center text-neutral-600">
                  {r.gender === "male"
                    ? "男性"
                    : r.gender === "female"
                    ? "女性"
                    : ""}
                </td>
                <td className="px-2.8 py-2.8 text-center text-neutral-600">
                  {ageFromBirthday(r.birthday)}
                </td>
                <td className="px-2.8 py-2.8 text-center text-neutral-600">
                  {safe(r.region)}
                </td>
                <td className="px-2.8 py-2.8 text-center text-neutral-600">
                  {formatJob(r.job_category_large, r.job_category_small)}
                </td>
                <td className="px-2.2 py-2.2 text-center">
                  <Toggle
                    checked={!!r.is_active}
                    onChange={(n) => toggleActive(r.id, n)}
                    label="active"
                  />
                </td>
                <td className="px-3.3 py-2.8 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {/* 編集：アイコンボタン */}
                    <Link
                      href={`/recipients/${r.id}/edit`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-200 hover:bg-neutral-50"
                      title="編集"
                      aria-label="編集"
                    >
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">編集</span>
                    </Link>

                    {/* 削除：アイコンボタン（赤系テキスト） */}
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
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
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
