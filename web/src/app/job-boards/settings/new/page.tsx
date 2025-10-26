// web/src/app/job-boards/settings/new/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import JobCategoryModal from "@/components/job-boards/JobCategoryModal";

const SITE_OPTIONS = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];

type Destination = {
  id: string;
  name: string;
  type: string;
  value: string;
  enabled: boolean;
};

export default function NewNotifyRule() {
  const [name, setName] = useState("");
  const [sites, setSites] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [age, setAge] = useState<string[]>([]);
  const [emp, setEmp] = useState<string[]>([]);
  const [sal, setSal] = useState<string[]>([]);
  const [large, setLarge] = useState<string[]>([]);
  const [small, setSmall] = useState<string[]>([]);
  const [openCat, setOpenCat] = useState(false);

  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selectedDestIds, setSelectedDestIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [openDestModal, setOpenDestModal] = useState(false);

  // スケジュール
  const [scheduleType, setScheduleType] = useState<"daily" | "weekly">(
    "weekly"
  );
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleDays, setScheduleDays] = useState<number[]>([1]); // 1=Mon
  const [timezone, setTimezone] = useState("Asia/Tokyo");

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/job-boards/destinations", {
        cache: "no-store",
      });
      const j = await r.json();
      if (r.ok) setDestinations(j.rows || []);
    })();
  }, []);

  const toggleSite = (v: string) =>
    setSites((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );

  const toggleDay = (d: number) =>
    setScheduleDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );

  const save = async () => {
    const body = {
      name,
      sites,
      age_bands: age,
      employment_types: emp,
      salary_bands: sal,
      large,
      small,
      enabled,
      schedule_type: scheduleType,
      schedule_time: scheduleTime,
      schedule_days: scheduleDays,
      timezone,
      destination_ids: selectedDestIds,
    };
    const r = await fetch("/api/job-boards/notify-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j?.error || "保存に失敗しました");
    alert("作成しました");
    location.href = "/job-boards/settings";
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">
            通知ルール作成
          </h1>
          <Link
            href="/job-boards/destinations"
            className="rounded-lg border px-3 py-1 text-sm hover:bg-neutral-50"
          >
            送り先を追加/編集
          </Link>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4 space-y-3">
          <Field label="名称">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="サイト">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSites(SITE_OPTIONS.map((s) => s.value))}
                className="text-xs rounded-lg border px-2 py-1"
              >
                すべて
              </button>
              <button
                onClick={() => setSites([])}
                className="text-xs rounded-lg border px-2 py-1"
              >
                解除
              </button>
              {SITE_OPTIONS.map((s) => (
                <label
                  key={s.value}
                  className="text-sm inline-flex items-center gap-1"
                >
                  <input
                    type="checkbox"
                    checked={sites.includes(s.value)}
                    onChange={() => toggleSite(s.value)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </Field>

          <Field label="職種">
            <button
              className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
              onClick={() => setOpenCat(true)}
            >
              選択（大:{large.length || "すべて"} / 小:
              {small.length || "すべて"}）
            </button>
          </Field>

          <Field label="年齢層">
            <Tags
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
          </Field>
          <Field label="雇用形態">
            <Tags
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
          </Field>
          <Field label="年収帯">
            <Tags
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
          </Field>

          {/* 送り先：羅列＋モーダルで選択 */}
          <Field label="送り先（複数可）">
            <div className="rounded-xl border p-3">
              {selectedDestIds.length === 0 ? (
                <div className="text-xs text-neutral-500">
                  未選択です。「送り先を選択」から選んでください。
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {destinations
                    .filter((d) => selectedDestIds.includes(d.id))
                    .map((d) => (
                      <span
                        key={d.id}
                        className="text-xs rounded-full border px-2 py-1 bg-indigo-50 border-indigo-300 text-indigo-700"
                      >
                        {d.name}（{d.type}:{d.value}）
                      </span>
                    ))}
                </div>
              )}
              <div className="mt-2">
                <button
                  className="text-xs rounded-lg border px-2 py-1 hover:bg-neutral-50"
                  onClick={() => setOpenDestModal(true)}
                >
                  送り先を選択
                </button>
              </div>
            </div>
          </Field>

          <Field label="スケジュール">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select
                className="rounded-lg border px-2 py-1"
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value as any)}
              >
                <option value="weekly">毎週</option>
                <option value="daily">毎日</option>
              </select>
              <input
                type="time"
                className="rounded-lg border px-2 py-1"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
              <select
                className="rounded-lg border px-2 py-1"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <option value="Asia/Tokyo">Asia/Tokyo</option>
              </select>
              {scheduleType === "weekly" && (
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <label key={d} className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={scheduleDays.includes(d)}
                        onChange={() => toggleDay(d)}
                      />
                      {["日", "月", "火", "水", "木", "金", "土"][d]}
                    </label>
                  ))}
                </div>
              )}
              <label className="ml-4 inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                有効化
              </label>
            </div>
          </Field>

          <div className="pt-2">
            <button
              onClick={save}
              className="rounded-lg border border-neutral-200 px-3 py-2 hover:bg-neutral-50"
            >
              作成する
            </button>
          </div>
        </section>

        {/* 職種モーダル */}
        {openCat && (
          <JobCategoryModal
            large={large}
            small={small}
            onCloseAction={() => setOpenCat(false)}
            onApplyAction={(L: string[], S: string[]) => {
              setLarge(L);
              setSmall(S);
              setOpenCat(false);
            }}
          />
        )}

        {/* 送り先モーダル */}
        {openDestModal && (
          <DestinationModal
            all={destinations}
            selected={selectedDestIds}
            onClose={() => setOpenDestModal(false)}
            onApply={(ids) => {
              setSelectedDestIds(ids);
              setOpenDestModal(false);
            }}
          />
        )}
      </main>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-600">{label}</div>
      {children}
    </div>
  );
}

function Tags({
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
      <button
        className="text-xs rounded-lg border px-2 py-1"
        onClick={() => setValues(options)}
      >
        すべて
      </button>
      <button
        className="text-xs rounded-lg border px-2 py-1"
        onClick={() => setValues([])}
      >
        解除
      </button>
      {options.map((o) => (
        <button
          key={o}
          className={`text-xs rounded-full border px-2 py-1 ${
            values.includes(o)
              ? "bg-indigo-50 border-indigo-400 text-indigo-700"
              : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
          }`}
          onClick={() => toggle(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** 送り先選択モーダル */
function DestinationModal({
  all,
  selected,
  onClose,
  onApply,
}: {
  all: Destination[];
  selected: string[];
  onClose: () => void;
  onApply: (ids: string[]) => void;
}) {
  const [sel, setSel] = useState<string[]>(selected);
  const toggle = (id: string) =>
    setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-[720px] max-w-[96vw] max-h-[85vh] bg-white rounded-2xl shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="font-semibold">送り先を選択</div>
            <button
              className="rounded-lg px-2 py-1 border text-sm hover:bg-neutral-50"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
          <div className="p-4 overflow-auto">
            {all.length === 0 ? (
              <div className="text-sm text-neutral-500">
                送り先がありません。「送り先一覧」で追加してください。
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {all.map((d) => (
                  <label
                    key={d.id}
                    className="rounded-xl border p-3 flex items-start gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={sel.includes(d.id)}
                      onChange={() => toggle(d.id)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-sm">{d.name}</div>
                      <div className="text-xs text-neutral-600">
                        {d.type}: {d.value}
                      </div>
                      {!d.enabled && (
                        <div className="text-[11px] text-amber-600 mt-1">
                          無効化中
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t flex justify-end">
            <button
              onClick={() => onApply(sel)}
              className="rounded-lg px-3 py-1 border text-sm hover:bg-neutral-50"
            >
              適用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
