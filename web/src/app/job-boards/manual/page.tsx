// web/src/app/job-boards/manual/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

const SITE_OPTIONS = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];
const AGE_BANDS = [
  "20歳以下",
  "25歳以下",
  "30歳以下",
  "35歳以下",
  "40歳以下",
  "45歳以下",
  "50歳以下",
  "55歳以下",
  "60歳以下",
  "65歳以下",
];
const EMP_TYPES = ["正社員", "契約社員", "派遣社員", "アルバイト", "業務委託"];
const SALARY_BAND = [
  "~300万",
  "300~400万",
  "400~500万",
  "500~600万",
  "600~800万",
  "800万~",
];

export default function JobBoardsManualPage() {
  const [sites, setSites] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [large, setLarge] = useState<string[]>([]);
  const [small, setSmall] = useState<string[]>([]);
  const [ages, setAges] = useState<string[]>([]);
  const [emps, setEmps] = useState<string[]>(["正社員"]);
  const [sals, setSals] = useState<string[]>([]);
  const [msg, setMsg] = useState("");

  const smallOptions = useMemo(() => {
    const set = new Set<string>();
    (large.length ? large : JOB_LARGE).forEach((l) =>
      (JOB_CATEGORIES[l] || []).forEach((s) => set.add(s))
    );
    return Array.from(set);
  }, [large]);

  const run = async () => {
    try {
      const res = await fetch("/api/job-boards/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites, large, small, ages, emps, sals }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "failed");
      alert("実行キューに登録しました。実行状況でご確認ください。");
      setMsg("");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const toggle = (arr: string[], setter: (v: string[]) => void, v: string) =>
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              手動実行
            </h1>
            <p className="text-sm text-neutral-500">
              指定条件でリサーチを即時実行します。
            </p>
          </div>
          <Link
            href="/job-boards/runs"
            className="rounded-xl border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            実行状況へ
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Block label="サイト">
            <button
              className="btn-mini"
              onClick={() => setSites(SITE_OPTIONS.map((s) => s.value))}
            >
              すべて
            </button>
            <button className="btn-mini" onClick={() => setSites([])}>
              解除
            </button>
            <div className="flex flex-wrap gap-2 mt-1">
              {SITE_OPTIONS.map((o) => (
                <label key={o.value} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sites.includes(o.value)}
                    onChange={() => toggle(sites, setSites, o.value)}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </Block>

          <Block label="職種（大）">
            <button className="btn-mini" onClick={() => setLarge(JOB_LARGE)}>
              すべて
            </button>
            <button className="btn-mini" onClick={() => setLarge([])}>
              解除
            </button>
            <div className="flex flex-wrap gap-2 mt-1">
              {JOB_LARGE.map((l) => (
                <label key={l} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={large.includes(l)}
                    onChange={() => toggle(large, setLarge, l)}
                  />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </Block>

          <Block label="職種（小）">
            <button className="btn-mini" onClick={() => setSmall(smallOptions)}>
              すべて
            </button>
            <button className="btn-mini" onClick={() => setSmall([])}>
              解除
            </button>
            <div className="flex flex-wrap gap-2 mt-1">
              {smallOptions.map((s) => (
                <label key={s} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={small.includes(s)}
                    onChange={() => toggle(small, setSmall, s)}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </Block>

          <Block label="年齢層">
            <Multi values={ages} setValues={setAges} options={AGE_BANDS} />
          </Block>
          <Block label="雇用形態">
            <Multi values={emps} setValues={setEmps} options={EMP_TYPES} />
          </Block>
          <Block label="年収帯">
            <Multi values={sals} setValues={setSals} options={SALARY_BAND} />
          </Block>
        </div>

        <div className="mt-6">
          <button
            onClick={run}
            className="rounded-lg px-4 py-2 border border-neutral-200 hover:bg-neutral-50"
          >
            今すぐ実行
          </button>
          {msg && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
              {msg}
            </pre>
          )}
        </div>
      </main>
      <style jsx global>{`
        .btn-mini {
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 8px;
          padding: 2px 8px;
          font-size: 12px;
          color: #555;
        }
        .btn-mini:hover {
          background: #f8f8f8;
        }
      `}</style>
    </>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 p-4">
      <div className="text-sm font-semibold text-neutral-800 mb-2">{label}</div>
      {children}
    </section>
  );
}

function Multi({
  values,
  setValues,
  options,
}: {
  values: string[];
  setValues: (v: string[]) => void;
  options: string[];
}) {
  const toggle = (v: string) =>
    setValues(
      values.includes(v) ? values.filter((x) => x !== v) : [...values, v]
    );
  return (
    <>
      <button className="btn-mini" onClick={() => setValues(options)}>
        すべて
      </button>
      <button className="btn-mini" onClick={() => setValues([])}>
        解除
      </button>
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map((o) => (
          <label key={o} className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.includes(o)}
              onChange={() => toggle(o)}
            />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </>
  );
}
