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
  schedule_type: "daily" | "weekly" | "monthly";
  schedule_time: string; // '09:00:00+09'
  schedule_days: number[]; // weekly: 0-6 / monthly: 1-31
  timezone: string;
};

export default function JobBoardSettingsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

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

  const toggleEnable = async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/job-boards/notify-rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const j = await res.json();
    if (!res.ok) setMsg(j?.error || "update failed");
    fetchRules();
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/job-boards/notify-rules/${id}`, {
      method: "DELETE",
    });
    const j = await res.json();
    if (!res.ok) setMsg(j?.error || "delete failed");
    fetchRules();
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              通知設定
            </h1>
            <p className="text-sm text-neutral-500">
              通知の頻度・時刻・フィルタを設定し、届け先を管理します。
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            ＋ 届け先を追加
          </button>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4">
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">メール</th>
                  <th className="px-3 py-3 text-left">サイト</th>
                  <th className="px-3 py-3 text-left">年齢層</th>
                  <th className="px-3 py-3 text-left">雇用形態</th>
                  <th className="px-3 py-3 text-left">年収帯</th>
                  <th className="px-3 py-3 text-left">頻度/スケジュール</th>
                  <th className="px-3 py-3 text-left">アクティブ</th>
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
                      {r.schedule_type === "daily" &&
                        `毎日 ${r.schedule_time} (${r.timezone})`}
                      {r.schedule_type === "weekly" &&
                        `毎週 ${r.schedule_days
                          .map(
                            (d) => ["日", "月", "火", "水", "木", "金", "土"][d]
                          )
                          .join(",")} ${r.schedule_time}`}
                      {r.schedule_type === "monthly" &&
                        `毎月 ${r.schedule_days.join(",")}日 ${
                          r.schedule_time
                        }`}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) => toggleEnable(r.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <button
                        className="rounded-lg px-2 py-1 border text-xs mr-2"
                        onClick={() => {
                          setOpen(true);
                          (window as any).__ruleEdit = r;
                        }}
                      >
                        編集
                      </button>
                      <button
                        className="rounded-lg px-2 py-1 border text-xs"
                        onClick={() => remove(r.id)}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
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

        {open && (
          <RuleModal
            onClose={() => {
              setOpen(false);
              (window as any).__ruleEdit = null;
              fetchRules();
            }}
          />
        )}
      </main>
    </>
  );
}

/* ====== モーダル（新規/編集 共通） ====== */
function RuleModal({ onClose }: { onClose: () => void }) {
  const edit: any =
    (typeof window !== "undefined" && (window as any).__ruleEdit) || null;

  const [email, setEmail] = useState<string>(edit?.email ?? "");
  const [sites, setSites] = useState<string[]>(
    edit?.sites ?? SITE_OPTIONS.map((s) => s.value)
  );
  const [ages, setAges] = useState<string[]>(edit?.age_bands ?? []);
  const [emps, setEmps] = useState<string[]>(
    edit?.employment_types ?? ["正社員"]
  );
  const [sals, setSals] = useState<string[]>(edit?.salary_bands ?? []);

  const [scheduleType, setScheduleType] = useState<
    "daily" | "weekly" | "monthly"
  >(edit?.schedule_type ?? "weekly");
  const [scheduleTime, setScheduleTime] = useState<string>(
    edit?.schedule_time ?? "09:00:00+09"
  );
  const [scheduleDays, setScheduleDays] = useState<number[]>(
    edit?.schedule_days ?? [1, 4]
  );
  const [timezone, setTimezone] = useState<string>(
    edit?.timezone ?? "Asia/Tokyo"
  );
  const [msg, setMsg] = useState("");

  const Chip: React.FC<{
    active: boolean;
    onClick: () => void;
    label: string;
  }> = ({ active, onClick, label }) => (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
      } mr-2 mb-2`}
    >
      {label}
    </button>
  );

  const toggle = (arr: string[], setter: (v: string[]) => void, v: string) =>
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const toggleNum = (arr: number[], setter: (v: number[]) => void, v: number) =>
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = async () => {
    const payload = {
      email,
      sites,
      age_bands: ages,
      employment_types: emps,
      salary_bands: sals,
      enabled: true,
      schedule_type: scheduleType,
      schedule_time: scheduleTime,
      schedule_days: scheduleDays,
      timezone,
    };
    const url = edit
      ? `/api/job-boards/notify-rules/${edit.id}`
      : "/api/job-boards/notify-rules";
    const method = edit ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "save failed");
    onClose();
  };

  const dayChips =
    scheduleType === "weekly"
      ? Array.from({ length: 7 }, (_, i) => ({
          v: i,
          label: ["日", "月", "火", "水", "木", "金", "土"][i],
        }))
      : Array.from({ length: 31 }, (_, i) => ({
          v: i + 1,
          label: String(i + 1),
        }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[900px] max-w-[96vw] rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">
            {edit ? "通知設定を編集" : "通知設定を追加"}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 border hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>
        <div className="p-4">
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
              <Chip
                active={sites.length === SITE_OPTIONS.length}
                label="すべて"
                onClick={() => setSites(SITE_OPTIONS.map((s) => s.value))}
              />
              <Chip
                active={sites.length === 0}
                label="解除"
                onClick={() => setSites([])}
              />
              <div className="mt-1">
                {SITE_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    active={sites.includes(o.value)}
                    onClick={() => toggle(sites, setSites, o.value)}
                  />
                ))}
              </div>
            </Block>
            <Block label="年齢層">
              <TagMulti values={ages} setValues={setAges} options={AGE_BANDS} />
            </Block>
            <Block label="雇用形態">
              <TagMulti values={emps} setValues={setEmps} options={EMP_TYPES} />
            </Block>
            <Block label="年収帯">
              <TagMulti
                values={sals}
                setValues={setSals}
                options={SALARY_BAND}
              />
            </Block>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Block label="頻度">
              {(["daily", "weekly", "monthly"] as const).map((t) => (
                <Chip
                  key={t}
                  label={
                    t === "daily" ? "毎日" : t === "weekly" ? "毎週" : "毎月"
                  }
                  active={scheduleType === t}
                  onClick={() => setScheduleType(t)}
                />
              ))}
            </Block>
            <Block label="通知時刻（例: 09:00:00+09）">
              <input
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm w-44"
              />
              <span className="ml-2 text-xs text-neutral-500">
                JSTなら +09 を付与
              </span>
            </Block>
            <Block
              label={
                scheduleType === "weekly" ? "曜日（複数可）" : "日（複数可）"
              }
            >
              <div>
                <Chip
                  active={scheduleDays.length === dayChips.length}
                  label="すべて"
                  onClick={() => setScheduleDays(dayChips.map((d) => d.v))}
                />
                <Chip
                  active={scheduleDays.length === 0}
                  label="解除"
                  onClick={() => setScheduleDays([])}
                />
              </div>
              <div className="mt-1">
                {dayChips.map((d) => (
                  <Chip
                    key={d.v}
                    label={d.label}
                    active={scheduleDays.includes(d.v)}
                    onClick={() =>
                      toggleNum(scheduleDays, setScheduleDays, d.v)
                    }
                  />
                ))}
              </div>
            </Block>
            <Block label="タイムゾーン">
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm w-56"
              />
            </Block>
          </div>

          {msg && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
              {msg}
            </pre>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
          <button
            onClick={save}
            className="rounded-lg px-3 py-2 border hover:bg-neutral-50 text-sm"
          >
            {edit ? "更新" : "追加"}
          </button>
        </div>
      </div>
    </div>
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

function TagMulti({
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
  const Chip: React.FC<{
    active: boolean;
    onClick: () => void;
    label: string;
  }> = ({ active, onClick, label }) => (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
      } mr-2 mb-2`}
    >
      {label}
    </button>
  );
  return (
    <>
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
      <div className="mt-1">
        {options.map((o) => (
          <Chip
            key={o}
            label={o}
            active={values.includes(o)}
            onClick={() => toggle(o)}
          />
        ))}
      </div>
    </>
  );
}
