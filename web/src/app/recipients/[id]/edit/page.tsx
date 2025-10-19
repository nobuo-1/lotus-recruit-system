// web/src/app/recipients/[id]/edit/page.tsx
"use client";
import React, { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PREFECTURES } from "@/constants/prefectures";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import { calcAgeFromBirthday } from "@/utils/date";
import { toastSuccess, toastError } from "@/components/AppToast";

type JobPair = { large: string; small: string };

export default function EditRecipientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [companyName, setCompanyName] = useState("");

  const [jobs, setJobs] = useState<JobPair[]>([{ large: "", small: "" }]);
  const age = useMemo(() => calcAgeFromBirthday(birthday), [birthday]);

  const smallOptions = (large: string) =>
    large ? JOB_CATEGORIES[large] ?? [] : [];
  const setJob = (i: number, k: keyof JobPair, v: string) =>
    setJobs((p) =>
      p.map((row, idx) =>
        idx === i
          ? { ...row, [k]: v, ...(k === "large" ? { small: "" } : {}) }
          : row
      )
    );
  const addJob = () => setJobs((p) => [...p, { large: "", small: "" }]);
  const removeJob = (i: number) =>
    setJobs((p) => p.filter((_, idx) => idx !== i));

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/recipients/get/${id}`);
      const j = await res.json();
      if (res.ok && j?.row) {
        const r = j.row;
        setName(r.name ?? "");
        setEmail(r.email ?? "");
        setBirthday(r.birthday ?? "");
        setPhone(r.phone ?? "");
        setRegion(r.region ?? "");
        setGender((r.gender as any) ?? "");
        setCompanyName(r.company_name ?? "");

        // job_categories(JSONB) → UIへ。無ければ単一列を初期値化
        const jc = Array.isArray(r.job_categories) ? r.job_categories : [];
        if (jc.length > 0) {
          setJobs(
            jc.map((x: any) => ({
              large: x?.large ?? "",
              small: x?.small ?? "",
            }))
          );
        } else {
          setJobs([
            {
              large: r.job_category_large ?? "",
              small: r.job_category_small ?? "",
            },
          ]);
        }
      } else {
        setMsg(`読み込みエラー: ${j?.error ?? res.statusText}`);
      }
      setLoading(false);
    })();
  }, [id]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const packed = jobs
      .filter((j) => j.large || j.small)
      .map((j) => ({ large: j.large || null, small: j.small || null }));
    const first = packed[0] || { large: null, small: null };

    const payload: any = {
      id,
      name,
      email,
      birthday: birthday || null,
      phone,
      region: region || null,
      gender: gender || null,
      company_name: companyName || null,
      job_categories: packed,
      job_category_large: first.large,
      job_category_small: first.small,
      job_type: first.small,
    };

    const res = await fetch("/api/recipients/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const t = await res.text();
    setMsg(`${res.status}: ${t}`);
    if (res.ok) {
      toastSuccess("保存しました");
      router.push("/recipients");
    } else {
      toastError(`保存に失敗しました（${res.status}）`);
    }
  };

  if (loading) return <main className="p-6">読み込み中…</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">
          求職者の編集
        </h1>
        <div className="flex gap-2">
          <Link
            href="/recipients"
            className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            一覧へ戻る
          </Link>
        </div>
      </div>

      <form onSubmit={onSave} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs text-neutral-500">名前</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border p-2"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500">
              メールアドレス
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-500">誕生日</label>
            <input
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              type="date"
              className="w-full rounded-lg border p-2"
            />
            <div className="mt-1 text-xs text-neutral-500">
              年齢：{age === null ? "-" : `${age} 歳`}
            </div>
          </div>
          <div>
            <label className="block text-xs text-neutral-500">電話番号</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border p-2"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-500">都道府県</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
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
                <input
                  type="radio"
                  name="gender"
                  checked={gender === "male"}
                  onChange={() => setGender("male")}
                />{" "}
                男性
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="gender"
                  checked={gender === "female"}
                  onChange={() => setGender("female")}
                />{" "}
                女性
              </label>
              <button
                type="button"
                onClick={() => setGender("")}
                className="ml-auto rounded border px-2 py-1 text-xs"
              >
                クリア
              </button>
            </div>
          </div>
        </div>

        {/* 複数職種 */}
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
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            ＋ 職種を追加
          </button>
        </section>

        <div className="flex gap-2">
          <button className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50">
            変更を保存
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            戻る
          </button>
        </div>

        <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
      </form>
    </main>
  );
}
