"use client";
import React, { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PREFECTURES } from "@/constants/prefectures";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import { calcAgeFromBirthday } from "@/utils/date";
import { toastSuccess, toastError } from "@/components/AppToast";

type JobPair = { large: string; small: string };

// 文字列/オブジェクト/表示済みラベルから {large, small} を抽出
const parseJobToPair = (it: unknown): JobPair => {
  // 1) 文字列（JSON or ラベル「大(小)」）
  if (typeof it === "string") {
    const s = it.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      try {
        const o = JSON.parse(s);
        return {
          large: typeof o?.large === "string" ? o.large : "",
          small: typeof o?.small === "string" ? o.small : "",
        };
      } catch {}
    }
    // 「大(小)」 or 「大（小）」形式
    const m = s.match(/^(.+?)\s*[（(]([^()（）]+)[)）]\s*$/);
    if (m) return { large: m[1].trim(), small: m[2].trim() };
    // 小のみ/大のみのラベルだった場合はとりあえず large に入れる
    return { large: s, small: "" };
  }

  // 2) オブジェクト
  if (it && typeof it === "object") {
    const any = it as any;
    return {
      large: typeof any?.large === "string" ? any.large : "",
      small: typeof any?.small === "string" ? any.small : "",
    };
  }
  return { large: "", small: "" };
};

export default function EditRecipientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // record state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [birthday, setBirthday] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");

  // 複数職種（最低1行）
  const [jobs, setJobs] = useState<JobPair[]>([{ large: "", small: "" }]);

  const age = useMemo(() => calcAgeFromBirthday(birthday), [birthday]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/recipients/get/${id}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (res.ok && j?.row) {
        const r = j.row;
        setName(r.name ?? "");
        setEmail(r.email ?? "");
        setCompanyName(r.company_name ?? "");
        setBirthday(r.birthday ?? "");
        setPhone(r.phone ?? "");
        setRegion(r.region ?? "");
        setGender((r.gender as any) ?? "");

        // --- 職種プリセット ---
        let preset: JobPair[] = [];
        if (Array.isArray(r.job_categories) && r.job_categories.length) {
          preset = r.job_categories.map(parseJobToPair);
        } else {
          preset = [
            {
              large: r.job_category_large ?? "",
              small: r.job_category_small ?? "",
            },
          ];
        }
        if (!preset.length) preset = [{ large: "", small: "" }];
        setJobs(preset);
      } else {
        setMsg(`読み込みエラー: ${j?.error ?? res.statusText}`);
      }
      setLoading(false);
    })();
  }, [id]);

  const addJob = () => setJobs((prev) => [...prev, { large: "", small: "" }]);
  const removeJob = (idx: number) =>
    setJobs((prev) => prev.filter((_, i) => i !== idx));
  const changeJobLarge = (idx: number, v: string) =>
    setJobs((prev) =>
      prev.map((j, i) => (i === idx ? { large: v, small: "" } : j))
    );
  const changeJobSmall = (idx: number, v: string) =>
    setJobs((prev) => prev.map((j, i) => (i === idx ? { ...j, small: v } : j)));

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // 空行を除外
    const cleaned = jobs
      .map((j) => ({
        large: j.large?.trim() || "",
        small: j.small?.trim() || "",
      }))
      .filter((j) => j.large || j.small);

    // 後方互換（メイン1行）
    const main = cleaned[0] ?? { large: null as any, small: null as any };

    const payload: any = {
      id,
      name,
      email,
      company_name: companyName || null,
      birthday: birthday || null,
      phone,
      region: region || null,
      gender: gender || null,

      // 旧フィールド
      job_category_large: main.large || null,
      job_category_small: main.small || null,
      job_type: main.small || null,

      // 新：複数職種
      job_categories: cleaned.length ? cleaned : null,
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
    <>
      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">
            受信者の編集
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

        <form onSubmit={onSave} className="space-y-6">
          {/* 基本情報 */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          </section>

          {/* 職種（複数追加可） */}
          <section className="space-y-3">
            <div className="text-sm text-neutral-500">職種（複数追加可）</div>

            {jobs.map((j, idx) => {
              const baseSmalls = j.large ? JOB_CATEGORIES[j.large] ?? [] : [];
              // 既存データがマスタ外でも選択肢に出す（未選択化防止）
              const smalls =
                j.small && !baseSmalls.includes(j.small)
                  ? [...baseSmalls, j.small]
                  : baseSmalls;

              return (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-3 md:grid-cols-5 items-end"
                >
                  <div className="md:col-span-2">
                    <label className="block text-xs text-neutral-500">
                      職種（大）
                    </label>
                    <select
                      value={j.large}
                      onChange={(e) => changeJobLarge(idx, e.target.value)}
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

                  <div className="md:col-span-2">
                    <label className="block text-xs text-neutral-500">
                      職種（小）
                    </label>
                    <select
                      value={j.small}
                      onChange={(e) => changeJobSmall(idx, e.target.value)}
                      disabled={!j.large}
                      className="w-full rounded-lg border p-2 disabled:bg-neutral-100"
                    >
                      <option value="">
                        {j.large ? "未選択" : "大カテゴリを先に選択"}
                      </option>
                      {smalls.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-1">
                    <button
                      type="button"
                      onClick={() => removeJob(idx)}
                      className="w-full rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
                      disabled={jobs.length <= 1}
                      title={jobs.length <= 1 ? "1件は必須" : "削除"}
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addJob}
              className="rounded-xl border border-neutral-200 px-3 py-1.5 hover:bg-neutral-50"
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
        </form>

        <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
      </main>
    </>
  );
}
