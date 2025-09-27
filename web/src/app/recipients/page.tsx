"use client";
import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Toggle from "@/components/Toggle";

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

  const load = async () => {
    const res = await fetch("/api/recipients/search?active=0");
    const j = await res.json();
    setRows(j?.rows ?? []);
  };
  useEffect(() => {
    load();
  }, []);

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

      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-[980px] w-full text-sm">
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
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200">
                <td className="px-3 py-3">{safe(r.name)}</td>
                <td className="px-3 py-3 text-neutral-600">{safe(r.email)}</td>
                <td className="px-3 py-3 text-neutral-600">{safe(r.phone)}</td>
                <td className="px-3 py-3 text-center text-neutral-600">
                  {r.gender === "male"
                    ? "男性"
                    : r.gender === "female"
                    ? "女性"
                    : ""}
                </td>
                <td className="px-3 py-3 text-center text-neutral-600">
                  {ageFromBirthday(r.birthday)}
                </td>
                <td className="px-3 py-3 text-center text-neutral-600">
                  {safe(r.region)}
                </td>
                <td className="px-3 py-3 text-center text-neutral-600">
                  {formatJob(r.job_category_large, r.job_category_small)}
                </td>
                <td className="px-3 py-3 text-center">
                  <Toggle
                    checked={!!r.is_active}
                    onChange={(n) => toggleActive(r.id, n)}
                    label="active"
                  />
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link
                      href={`/recipients/${r.id}/edit`}
                      className="rounded-lg border border-neutral-200 px-3 py-1 hover:bg-neutral-50"
                    >
                      編集
                    </Link>
                    <button
                      onClick={() => onDelete(r.id)}
                      className="rounded-lg border border-neutral-200 px-3 py-1 text-red-600 hover:bg-neutral-50"
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
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
