"use client";
import React from "react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PREFECTURES } from "@/constants/prefectures";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import WheelDatePicker from "@/components/WheelDatePicker";
import { toastSuccess, toastError } from "@/components/AppToast";

export default function NewRecipientPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [large, setLarge] = useState<string>("");
  const [small, setSmall] = useState<string>("");
  const smallOptions = useMemo(
    () => (large ? JOB_CATEGORIES[large] ?? [] : []),
    [large]
  );

  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const form = formRef.current;
    const fd = new FormData(e.currentTarget);
    const payload: any = Object.fromEntries(fd);

    payload.gender = payload.gender || null;
    payload.region = payload.region || null;
    payload.job_category_large = payload.job_category_large || null;
    payload.job_category_small = payload.job_category_small || null;
    payload.job_type = payload.job_category_small || null;

    const res = await fetch("/api/recipients/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const t = await res.text();
    setMsg(`${res.status}: ${t}`);
    setSubmitting(false);

    if (res.ok) {
      toastSuccess("保存しました");
      form?.reset();
      router.back();
    } else {
      toastError(`保存に失敗しました（${res.status}）`);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-neutral-900">
          求職者の新規追加
        </h1>
      </div>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
        {/* 基本情報 */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs text-neutral-500">名前</label>
            <input name="name" className="w-full rounded-lg border p-2" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500">
              メールアドレス
            </label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border p-2"
            />
          </div>

          {/* ← ここがホイール式ピッカー */}
          <div className="md:col-span-1">
            <WheelDatePicker name="birthday" defaultValue="1995-01-01" />
          </div>

          <div>
            <label className="block text-xs text-neutral-500">電話番号</label>
            <input name="phone" className="w-full rounded-lg border p-2" />
          </div>

          <div>
            <label className="block text-xs text-neutral-500">都道府県</label>
            <select
              name="region"
              defaultValue=""
              className="w-full rounded-lg border p-2"
            >
              <option value="">未選択</option>
              {PREFECTURES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-neutral-500">性別</label>
            <div className="flex items-center gap-4 rounded-lg border p-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="gender" value="male" /> 男性
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="gender" value="female" /> 女性
              </label>
            </div>
          </div>
        </section>

        {/* 職種（Doda準拠拡充） */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs text-neutral-500">
              職種（大カテゴリ）
            </label>
            <select
              name="job_category_large"
              value={large}
              onChange={(e) => {
                setLarge(e.target.value);
                setSmall("");
              }}
              className="w-full rounded-lg border p-2"
            >
              <option value="">未選択</option>
              {JOB_LARGE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-neutral-500">
              職種（小カテゴリ）
            </label>
            <select
              name="job_category_small"
              value={small}
              onChange={(e) => setSmall(e.target.value)}
              disabled={!large}
              className="w-full rounded-lg border p-2 disabled:bg-neutral-100"
            >
              <option value="">
                {large ? "未選択" : "大カテゴリを先に選択"}
              </option>
              {(large ? smallOptions : []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </section>

        <button
          disabled={submitting}
          className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 disabled:opacity-50"
        >
          {submitting ? "送信中…" : "登録する"}
        </button>

        <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
      </form>
    </main>
  );
}
