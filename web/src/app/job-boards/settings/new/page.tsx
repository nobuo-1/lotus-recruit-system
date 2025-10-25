// web/src/app/job-boards/settings/new/page.tsx
"use client";

import React, { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";
import Link from "next/link";

const SITE_OPTIONS = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];

export default function JBSettingsNew() {
  const [name, setName] = useState("");
  const [sites, setSites] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [large, setLarge] = useState<string[]>([]);
  const [small, setSmall] = useState<string[]>([]);
  const [age, setAge] = useState<string[]>([]);
  const [emp, setEmp] = useState<string[]>([]);
  const [sal, setSal] = useState<string[]>([]);
  const [freq, setFreq] = useState<string>("weekly");
  const [isActive, setIsActive] = useState<boolean>(true);
  const [msg, setMsg] = useState("");

  const allOrToggle = (
    values: string[],
    setter: (x: string[]) => void,
    options: string[],
    takeAll: boolean
  ) => setter(takeAll ? options : []);

  const create = async () => {
    setMsg("");
    const resp = await fetch("/api/job-boards/notify-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        sites,
        large,
        small,
        age,
        emp,
        sal,
        frequency: freq,
        is_active: isActive,
      }),
    });
    const j = await resp.json();
    if (!resp.ok) {
      setMsg(String(j?.error || "failed"));
      return;
    }
    window.location.href = "/job-boards/settings";
  };

  // 小分類候補
  const smallOptions = large.length
    ? Array.from(new Set(large.flatMap((l) => JOB_CATEGORIES[l] || [])))
    : [];

  const Chip: React.FC<{
    active: boolean;
    label: string;
    onClick: () => void;
  }> = ({ active, label, onClick }) => (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-indigo-900">
              通知ルールの新規作成
            </h1>
            <p className="text-sm text-neutral-500">
              サイト・職種・頻度などを設定します
            </p>
          </div>
          <Link
            href="/job-boards/settings"
            className="text-sm text-neutral-600 underline-offset-2 hover:underline"
          >
            一覧へ戻る
          </Link>
        </div>

        <div className="rounded-2xl border border-neutral-200 p-4 space-y-4">
          <div>
            <label className="text-sm block mb-1">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="例：週次まとめ（IT/営業）"
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600">
              サイト
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip
                active={sites.length === SITE_OPTIONS.length}
                label="すべて"
                onClick={() =>
                  allOrToggle(
                    sites,
                    setSites,
                    SITE_OPTIONS.map((s) => s.value),
                    true
                  )
                }
              />
              <Chip
                active={sites.length === 0}
                label="解除"
                onClick={() => setSites([])}
              />
              {SITE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={sites.includes(o.value)}
                  onClick={() =>
                    setSites(
                      sites.includes(o.value)
                        ? sites.filter((x) => x !== o.value)
                        : [...sites, o.value]
                    )
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600">
              職種（大）→（小）
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <Chip
                active={large.length === JOB_LARGE.length}
                label="大分類すべて"
                onClick={() => allOrToggle(large, setLarge, JOB_LARGE, true)}
              />
              <Chip
                active={large.length === 0}
                label="解除"
                onClick={() => setLarge([])}
              />
              {JOB_LARGE.map((lg) => (
                <Chip
                  key={lg}
                  label={lg}
                  active={large.includes(lg)}
                  onClick={() =>
                    setLarge(
                      large.includes(lg)
                        ? large.filter((x) => x !== lg)
                        : [...large, lg]
                    )
                  }
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip
                active={
                  small.length === smallOptions.length && small.length > 0
                }
                label="小分類すべて"
                onClick={() => setSmall(smallOptions)}
              />
              <Chip
                active={small.length === 0}
                label="解除"
                onClick={() => setSmall([])}
              />
              {smallOptions.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={small.includes(s)}
                  onClick={() =>
                    setSmall(
                      small.includes(s)
                        ? small.filter((x) => x !== s)
                        : [...small, s]
                    )
                  }
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SelectTag
              title="年齢層"
              values={age}
              setValues={setAge}
              options={[
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
              ]}
            />
            <SelectTag
              title="雇用形態"
              values={emp}
              setValues={setEmp}
              options={[
                "正社員",
                "契約社員",
                "派遣社員",
                "アルバイト",
                "業務委託",
              ]}
            />
            <SelectTag
              title="年収帯"
              values={sal}
              setValues={setSal}
              options={[
                "~300万",
                "300~400万",
                "400~500万",
                "500~600万",
                "600~800万",
                "800万~",
              ]}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm block mb-1">頻度</label>
              <select
                value={freq}
                onChange={(e) => setFreq(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="daily">毎日</option>
                <option value="weekly">毎週</option>
                <option value="monthly">毎月</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                アクティブ
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={create}
              className="rounded-lg border px-3 py-1 hover:bg-neutral-50"
            >
              作成する
            </button>
          </div>

          {msg && (
            <pre className="text-xs text-red-600 whitespace-pre-wrap">
              {msg}
            </pre>
          )}
        </div>
      </main>
    </>
  );
}

function SelectTag({
  title,
  values,
  setValues,
  options,
}: {
  title: string;
  values: string[];
  setValues: (v: string[]) => void;
  options: string[];
}) {
  const Chip: React.FC<{
    active: boolean;
    label: string;
    onClick: () => void;
  }> = ({ active, label, onClick }) => (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );
  const toggle = (v: string) =>
    setValues(
      values.includes(v) ? values.filter((x) => x !== v) : [...values, v]
    );
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-neutral-700">{title}</div>
      <div className="flex flex-wrap gap-2">
        <Chip
          active={values.length === options.length}
          label="すべて"
          onClick={() => setValues(options)}
        />
        <Chip
          active={values.length === 0}
          label="解除"
          onClick={() => setValues([])}
        />
        {options.map((o) => (
          <Chip
            key={o}
            label={o}
            active={values.includes(o)}
            onClick={() => toggle(o)}
          />
        ))}
      </div>
    </div>
  );
}
