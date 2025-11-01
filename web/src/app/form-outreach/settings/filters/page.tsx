// web/src/app/form-outreach/settings/filters/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

const PREFS = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

const SIZE_RANGES = ["1-9", "10-49", "50-249", "250+"];

export default function FiltersPage() {
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [prefectures, setPrefectures] = useState<string[]>([]);
  const [sizeRanges, setSizeRanges] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setMsg("");
      try {
        const r = await fetch("/api/form-outreach/settings/filters", {
          headers: { "x-tenant-id": TENANT_ID },
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "fetch failed");
        const f = j?.filters || {};
        setPrefectures(f.prefectures || []);
        setSizeRanges(f.employee_size_ranges || []);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const togglePref = (p: string) => {
    setPrefectures((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };
  const toggleSize = (s: string) => {
    setSizeRanges((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/settings/filters", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({ prefectures, employee_size_ranges: sizeRanges }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "save failed");
      setMsg("保存しました。");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">
            取得フィルタ設定
          </h1>
          <p className="text-sm text-neutral-500">
            求人企業の取得条件（都道府県・従業員レンジ）を保存します。
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4 mb-6">
          <div className="mb-3 text-sm font-medium text-neutral-800">
            都道府県
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {PREFS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefectures.includes(p)}
                  onChange={() => togglePref(p)}
                />
                {p}
              </label>
            ))}
          </div>

          <hr className="my-4 border-neutral-200" />

          <div className="mb-2 text-sm font-medium text-neutral-800">
            従業員規模レンジ
          </div>
          <div className="flex flex-wrap gap-4">
            {SIZE_RANGES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sizeRanges.includes(s)}
                  onChange={() => toggleSize(s)}
                />
                {s}
              </label>
            ))}
          </div>

          <div className="mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存する"}
            </button>
          </div>
        </section>

        {msg && (
          <pre className="whitespace-pre-wrap text-xs text-neutral-600">
            {msg}
          </pre>
        )}
      </main>
    </>
  );
}
