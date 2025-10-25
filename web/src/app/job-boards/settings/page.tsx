// web/src/app/job-boards/settings/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

export default function JobBoardsSettings() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    email: "",
    frequency: "weekly",
    include_jobs: true,
    include_candidates: true,
    filters: { sites: [], large: "", small: "", ages: [], emp: [], sal: [] },
    enabled: true,
  });
  const [opts, setOpts] = useState<any>({
    sites: [],
    ageBands: [],
    employmentTypes: [],
    salaryBands: [],
  });

  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([
        fetch("/api/job-boards/alerts").then((r) => r.json()),
        fetch("/api/job-boards/options").then((r) => r.json()),
      ]);
      setRows(a?.rows ?? []);
      setOpts(
        b ?? { sites: [], ageBands: [], employmentTypes: [], salaryBands: [] }
      );
    })();
  }, []);

  const save = async () => {
    await fetch("/api/job-boards/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await fetch("/api/job-boards/alerts").then((r) => r.json());
    setRows(j?.rows ?? []);
    setForm({
      email: "",
      frequency: "weekly",
      include_jobs: true,
      include_candidates: true,
      filters: { sites: [], large: "", small: "", ages: [], emp: [], sal: [] },
      enabled: true,
    });
  };

  const updateRow = async (id: string, patch: any) => {
    await fetch("/api/job-boards/alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const j = await fetch("/api/job-boards/alerts").then((r) => r.json());
    setRows(j?.rows ?? []);
  };

  const removeRow = async (id: string) => {
    await fetch(`/api/job-boards/alerts?id=${id}`, { method: "DELETE" });
    const j = await fetch("/api/job-boards/alerts").then((r) => r.json());
    setRows(j?.rows ?? []);
  };

  const f = form.filters;

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-4">
          通知設定
        </h1>

        {/* 追加フォーム */}
        <section className="rounded-2xl border border-neutral-200 p-4">
          <h2 className="font-semibold mb-2">新規届け先</h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              placeholder="email@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <select
              className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              <option value="daily">毎日</option>
              <option value="weekly">毎週</option>
              <option value="monthly">毎月</option>
            </select>
            <div className="flex items-center gap-3">
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={form.include_jobs}
                  onChange={(e) =>
                    setForm({ ...form, include_jobs: e.target.checked })
                  }
                />{" "}
                求人数
              </label>
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={form.include_candidates}
                  onChange={(e) =>
                    setForm({ ...form, include_candidates: e.target.checked })
                  }
                />{" "}
                求職者数
              </label>
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.checked })
                  }
                />{" "}
                有効
              </label>
            </div>
          </div>

          {/* フィルタ */}
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <MultiChips
              label="サイト"
              options={opts.sites.map((s: any) => s.key)}
              values={f.sites}
              onChange={(v) =>
                setForm({ ...form, filters: { ...f, sites: v } })
              }
            />
            <div>
              <div className="text-xs text-neutral-600 mb-1">職種（大）</div>
              <select
                className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                value={f.large}
                onChange={(e) =>
                  setForm({
                    ...form,
                    filters: { ...f, large: e.target.value, small: "" },
                  })
                }
              >
                <option value="">すべて</option>
                {JOB_LARGE.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">職種（小）</div>
              <select
                className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                value={f.small}
                onChange={(e) =>
                  setForm({ ...form, filters: { ...f, small: e.target.value } })
                }
                disabled={!f.large}
              >
                <option value="">すべて</option>
                {f.large &&
                  (JOB_CATEGORIES[f.large] || []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <MultiChips
              label="年齢層"
              options={opts.ageBands}
              values={f.ages}
              onChange={(v) => setForm({ ...form, filters: { ...f, ages: v } })}
            />
            <MultiChips
              label="雇用形態"
              options={opts.employmentTypes}
              values={f.emp}
              onChange={(v) => setForm({ ...form, filters: { ...f, emp: v } })}
            />
            <MultiChips
              label="年収帯"
              options={opts.salaryBands}
              values={f.sal}
              onChange={(v) => setForm({ ...form, filters: { ...f, sal: v } })}
            />
          </div>

          <div className="mt-3">
            <button
              onClick={save}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
            >
              追加
            </button>
          </div>
        </section>

        {/* 一覧 */}
        <section className="mt-6 overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">Email</th>
                <th className="px-3 py-3 text-left">頻度</th>
                <th className="px-3 py-3 text-left">含める</th>
                <th className="px-3 py-3 text-left">フィルタ</th>
                <th className="px-3 py-3 text-left">状態</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">{r.frequency}</td>
                  <td className="px-3 py-2">
                    {[
                      r.include_jobs ? "求人" : "",
                      r.include_candidates ? "求職" : "",
                    ]
                      .filter(Boolean)
                      .join("/") || "-"}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 text-xs">
                    {JSON.stringify(r.filters)}
                  </td>
                  <td className="px-3 py-2">{r.enabled ? "有効" : "停止"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => updateRow(r.id, { enabled: !r.enabled })}
                        className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                      >
                        {r.enabled ? "停止" : "有効化"}
                      </button>
                      <button
                        onClick={() => removeRow(r.id)}
                        className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
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
                    colSpan={6}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    届け先がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}

function MultiChips({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <div className="text-xs text-neutral-600 mb-1">{label}</div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onChange([])}
          className={`rounded-lg px-2 py-1 text-xs ${
            values.length === 0
              ? "border border-indigo-400 text-indigo-700"
              : "border border-neutral-200 text-neutral-700"
          }`}
        >
          すべて
        </button>
        {options.map((o) => (
          <label
            key={o}
            className={`cursor-pointer rounded-lg border px-2 py-1 text-xs ${
              values.includes(o)
                ? "border-indigo-400 text-indigo-700"
                : "border-neutral-200 text-neutral-700"
            }`}
          >
            <input
              type="checkbox"
              className="mr-1"
              checked={values.includes(o)}
              onChange={() =>
                onChange(
                  values.includes(o)
                    ? values.filter((x) => x !== o)
                    : [...values, o]
                )
              }
            />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}
