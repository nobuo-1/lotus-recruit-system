// web/src/app/form-outreach/automation/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

export default function OutreachAutomation() {
  const [row, setRow] = useState<any>(null);
  const [form, setForm] = useState<any>({
    enabled: false,
    daily_limit: 100,
    allow_form: true,
    allow_email: true,
    weekday_mask: 127,
    start_hour: 9,
    end_hour: 18,
    cooldown_days: 7,
    max_per_domain: 20,
  });

  useEffect(() => {
    (async () => {
      const j = await fetch("/api/form-outreach/limits", {
        cache: "no-store",
      }).then((r) => r.json());
      const r = j?.row || form;
      setRow(r);
      setForm(r);
    })();
  }, []);

  const save = async () => {
    await fetch("/api/form-outreach/limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    alert("保存しました");
  };

  const toggleBit = (bit: number) => {
    setForm((f: any) => ({ ...f, weekday_mask: f.weekday_mask ^ bit }));
  };
  const isOn = (bit: number) => !!(form.weekday_mask & bit);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-4">
          自動実行設定
        </h1>

        <div className="rounded-2xl border border-neutral-200 p-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm">
            <input
              type="checkbox"
              className="mr-2"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />{" "}
            有効化
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm">一日上限</span>
            <input
              type="number"
              className="w-24 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              value={form.daily_limit}
              onChange={(e) =>
                setForm({ ...form, daily_limit: Number(e.target.value || 0) })
              }
            />
          </div>
          <label className="text-sm">
            <input
              type="checkbox"
              className="mr-2"
              checked={form.allow_form}
              onChange={(e) =>
                setForm({ ...form, allow_form: e.target.checked })
              }
            />{" "}
            フォーム送信を許可
          </label>
          <label className="text-sm">
            <input
              type="checkbox"
              className="mr-2"
              checked={form.allow_email}
              onChange={(e) =>
                setForm({ ...form, allow_email: e.target.checked })
              }
            />{" "}
            メール送信を許可
          </label>
          <div className="text-sm">
            曜日許可：
            <div className="mt-1 flex flex-wrap gap-2">
              {[
                { lbl: "日", bit: 1 },
                { lbl: "月", bit: 2 },
                { lbl: "火", bit: 4 },
                { lbl: "水", bit: 8 },
                { lbl: "木", bit: 16 },
                { lbl: "金", bit: 32 },
                { lbl: "土", bit: 64 },
              ].map((d) => (
                <button
                  key={d.bit}
                  onClick={() => toggleBit(d.bit)}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    isOn(d.bit)
                      ? "border border-indigo-400 text-indigo-700"
                      : "border border-neutral-200 text-neutral-700"
                  }`}
                >
                  {d.lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">送信時間帯</span>
            <input
              type="number"
              className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              value={form.start_hour}
              onChange={(e) =>
                setForm({ ...form, start_hour: Number(e.target.value || 0) })
              }
            />
            〜
            <input
              type="number"
              className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              value={form.end_hour}
              onChange={(e) =>
                setForm({ ...form, end_hour: Number(e.target.value || 0) })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">同一企業クールダウン（日）</span>
            <input
              type="number"
              className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              value={form.cooldown_days}
              onChange={(e) =>
                setForm({ ...form, cooldown_days: Number(e.target.value || 0) })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">1ドメイン/日の上限</span>
            <input
              type="number"
              className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              value={form.max_per_domain}
              onChange={(e) =>
                setForm({
                  ...form,
                  max_per_domain: Number(e.target.value || 0),
                })
              }
            />
          </div>
        </div>

        <div className="mt-3">
          <button
            onClick={save}
            className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            保存
          </button>
        </div>
      </main>
    </>
  );
}
