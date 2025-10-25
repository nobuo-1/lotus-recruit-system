// web/src/app/job-boards/settings/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

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

type Rule = {
  id: string;
  email: string;
  sites: string[];
  age_bands: string[];
  employment_types: string[];
  salary_bands: string[];
  enabled: boolean;
};

export default function JobBoardSettingsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [msg, setMsg] = useState("");

  const [email, setEmail] = useState("");
  const [sites, setSites] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [ages, setAges] = useState<string[]>([]);
  const [emps, setEmps] = useState<string[]>(["正社員"]);
  const [sals, setSals] = useState<string[]>([]);

  const fetchRules = async () => {
    try {
      const res = await fetch("/api/job-boards/notify-rules", {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "fetch error");
      setRules(j.rows ?? []);
      setMsg("");
    } catch (e: any) {
      setMsg(String(e?.message || e));
      setRules([]);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const toggleArr = (arr: string[], setArr: (v: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const addRule = async () => {
    const payload = {
      email,
      sites,
      age_bands: ages,
      employment_types: emps,
      salary_bands: sals,
      enabled: true,
    };
    const res = await fetch("/api/job-boards/notify-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "create failed");
    setEmail("");
    setSites(SITE_OPTIONS.map((s) => s.value));
    setAges([]);
    setEmps(["正社員"]);
    setSals([]);
    fetchRules();
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/job-boards/notify-rules/${id}`, {
      method: "DELETE",
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "delete failed");
    fetchRules();
  };

  const toggleEnable = async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/job-boards/notify-rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "update failed");
    fetchRules();
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">通知設定</h1>
          <p className="text-sm text-neutral-500">
            届け先と、届ける情報の取捨選択を登録します。
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4 mb-6">
          <div className="mb-3 text-sm font-semibold text-neutral-800">
            新規登録
          </div>

          <div className="mb-3">
            <div className="text-xs text-neutral-600 mb-1">届け先メール</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alert@example.com"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Block label="対象サイト">
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-mini"
                  onClick={() => setSites(SITE_OPTIONS.map((s) => s.value))}
                >
                  すべて
                </button>
                <button className="btn-mini" onClick={() => setSites([])}>
                  解除
                </button>
                {SITE_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className="inline-flex items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={sites.includes(o.value)}
                      onChange={() => toggleArr(sites, setSites, o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </Block>
            <Block label="年齢層">
              <MultiVals
                values={ages}
                setValues={setAges}
                options={AGE_BANDS}
              />
            </Block>
            <Block label="雇用形態">
              <MultiVals
                values={emps}
                setValues={setEmps}
                options={EMP_TYPES}
              />
            </Block>
            <Block label="年収帯">
              <MultiVals
                values={sals}
                setValues={setSals}
                options={SALARY_BAND}
              />
            </Block>
          </div>

          <div className="mt-4">
            <button
              onClick={addRule}
              disabled={!email}
              className={`rounded-lg px-3 py-2 text-sm ${
                email
                  ? "border border-neutral-200 hover:bg-neutral-50"
                  : "border border-neutral-100 text-neutral-400"
              }`}
            >
              追加
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 p-4">
          <div className="mb-3 text-sm font-semibold text-neutral-800">
            届け先一覧
          </div>
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">メール</th>
                  <th className="px-3 py-3 text-left">サイト</th>
                  <th className="px-3 py-3 text-left">年齢層</th>
                  <th className="px-3 py-3 text-left">雇用形態</th>
                  <th className="px-3 py-3 text-left">年収帯</th>
                  <th className="px-3 py-3 text-left">有効</th>
                  <th className="px-3 py-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3">{r.email}</td>
                    <td className="px-3 py-3">
                      {r.sites.join(", ") || "すべて"}
                    </td>
                    <td className="px-3 py-3">
                      {r.age_bands.join(", ") || "すべて"}
                    </td>
                    <td className="px-3 py-3">
                      {r.employment_types.join(", ") || "すべて"}
                    </td>
                    <td className="px-3 py-3">
                      {r.salary_bands.join(", ") || "すべて"}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) => toggleEnable(r.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <button className="btn-mini" onClick={() => remove(r.id)}>
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      登録がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {msg && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
              {msg}
            </pre>
          )}
        </section>

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
      </main>
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
    <div>
      <div className="text-xs text-neutral-600 mb-1">{label}</div>
      {children}
    </div>
  );
}

function MultiVals({
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
    <div className="flex flex-wrap gap-2">
      <button className="btn-mini" onClick={() => setValues(options)}>
        すべて
      </button>
      <button className="btn-mini" onClick={() => setValues([])}>
        解除
      </button>
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
  );
}
