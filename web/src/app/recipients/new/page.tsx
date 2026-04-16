// web/src/app/recipients/new/page.tsx
"use client";
import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PREFECTURES } from "@/constants/prefectures";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import WheelDatePicker from "@/components/WheelDatePicker";
import { toastSuccess, toastError } from "@/components/AppToast";
import { PageHero, PageMain, SurfaceCard } from "@/components/PageChrome";

type JobPair = { large: string; small: string };

export default function NewRecipientPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // 会社名
  const [companyName, setCompanyName] = useState("");

  // 職種（複数行）
  const [jobs, setJobs] = useState<JobPair[]>([{ large: "", small: "" }]);
  const smallOptions = (large: string) =>
    large ? JOB_CATEGORIES[large] ?? [] : [];

  const addJob = () => setJobs((p) => [...p, { large: "", small: "" }]);
  const removeJob = (i: number) =>
    setJobs((p) => p.filter((_, idx) => idx !== i));
  const setJob = (i: number, k: keyof JobPair, v: string) =>
    setJobs((p) =>
      p.map((row, idx) =>
        idx === i
          ? { ...row, [k]: v, ...(k === "large" ? { small: "" } : {}) }
          : row
      )
    );

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const payload: any = Object.fromEntries(fd);

    // 基本項目の正規化
    payload.gender = payload.gender || null;
    payload.region = payload.region || null;

    // 複数職種
    const packed = jobs
      .filter((j) => j.large || j.small)
      .map((j) => ({ large: j.large || null, small: j.small || null }));
    payload.job_categories = packed;
    const first = packed[0] || { large: null, small: null };
    payload.job_category_large = first.large;
    payload.job_category_small = first.small;
    payload.job_type = first.small;

    // 会社名
    payload.company_name = companyName || null;

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
      formRef.current?.reset();
      router.back();
    } else {
      toastError(`保存に失敗しました（${res.status}）`);
    }
  };

  return (
    <PageMain className="max-w-5xl space-y-6">
      <PageHero
        eyebrow="Recipients"
        title="受信者を新規追加"
        description="基本情報と職種情報を分けて入力できる、メール配信画面と同じトーンのフォームです。"
        accent="blue"
        actions={[
          { href: "/recipients", label: "受信者一覧", variant: "secondary" },
        ]}
      />

      <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
        <SurfaceCard>
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
              基本情報
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              連絡先とプロフィールの基本項目です。
            </p>
          </div>
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

          {/* 会社名 */}
          <div className="md:col-span-2">
            <label className="block text-xs text-neutral-500">会社名</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border p-2"
              placeholder="（任意）"
            />
          </div>

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
        </SurfaceCard>

        <SurfaceCard>
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
              職種
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              複数の職種を追加できます。
            </p>
          </div>
        <section className="space-y-3">
          <div className="text-sm font-medium text-neutral-700">
            職種（複数追加可）
          </div>
          {jobs.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-3 md:grid-cols-2 items-end"
            >
              <div>
                <label className="block text-xs text-neutral-500">
                  職種（大）
                </label>
                <select
                  value={row.large}
                  onChange={(e) => setJob(i, "large", e.target.value)}
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
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-neutral-500">
                    職種（小）
                  </label>
                  <select
                    value={row.small}
                    onChange={(e) => setJob(i, "small", e.target.value)}
                    disabled={!row.large}
                    className="w-full rounded-lg border p-2 disabled:bg-neutral-100"
                  >
                    <option value="">
                      {row.large ? "未選択" : "大カテゴリを先に選択"}
                    </option>
                    {smallOptions(row.large).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => removeJob(i)}
                    className="h-10 mt-5 rounded-lg border px-3 text-sm"
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addJob}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            ＋ 職種を追加
          </button>
        </section>
        </SurfaceCard>

        <button
          disabled={submitting}
          className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {submitting ? "送信中…" : "登録する"}
        </button>

        <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
      </form>
    </PageMain>
  );
}
