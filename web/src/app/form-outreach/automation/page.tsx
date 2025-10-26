// web/src/app/form-outreach/automation/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type AutoSetting = {
  id?: string;
  enabled: boolean;
  schedule_type: "daily" | "weekly";
  schedule_time: string; // "09:00"
  schedule_days: number[]; // weekly のときのみ
  timezone: string;
};

export default function AutomationSetting() {
  const [s, setS] = useState<AutoSetting>({
    enabled: false,
    schedule_type: "weekly",
    schedule_time: "09:00",
    schedule_days: [1],
    timezone: "Asia/Tokyo",
  });
  const [msg, setMsg] = useState("");

  const load = async () => {
    const r = await fetch("/api/form-outreach/automation", {
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j?.error || "fetch failed");
    if (j.row) setS(j.row);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const r = await fetch("/api/form-outreach/automation", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j?.error || "save failed");
    setMsg("保存しました");
  };

  const toggleDay = (d: number) =>
    setS((prev) => ({
      ...prev,
      schedule_days: prev.schedule_days.includes(d)
        ? prev.schedule_days.filter((x) => x !== d)
        : [...prev.schedule_days, d],
    }));

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold mb-3">自動実行設定</h1>

        <section className="rounded-2xl border border-neutral-200 p-4 space-y-3">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => setS({ ...s, enabled: e.target.checked })}
            />
            有効化
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border px-2 py-1 text-sm"
              value={s.schedule_type}
              onChange={(e) =>
                setS({ ...s, schedule_type: e.target.value as any })
              }
            >
              <option value="weekly">毎週</option>
              <option value="daily">毎日</option>
            </select>
            <input
              type="time"
              className="rounded-lg border px-2 py-1 text-sm"
              value={s.schedule_time}
              onChange={(e) => setS({ ...s, schedule_time: e.target.value })}
            />
            <select
              className="rounded-lg border px-2 py-1 text-sm"
              value={s.timezone}
              onChange={(e) => setS({ ...s, timezone: e.target.value })}
            >
              <option value="Asia/Tokyo">Asia/Tokyo</option>
            </select>
            {s.schedule_type === "weekly" && (
              <div className="flex items-center gap-2 text-sm">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <label key={d} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={s.schedule_days.includes(d)}
                      onChange={() => toggleDay(d)}
                    />
                    {["日", "月", "火", "水", "木", "金", "土"][d]}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={save}
              className="rounded-lg border border-neutral-200 px-3 py-2 hover:bg-neutral-50"
            >
              保存
            </button>
            {msg && (
              <span className="ml-2 text-xs text-neutral-500">{msg}</span>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
