// web/src/components/WheelDatePicker.tsx
"use client";
import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  label?: string;
  name?: string; // hidden name
  defaultValue?: string; // "YYYY-MM-DD"
  minDateISO?: string | null; // 例: 今日
  maxDateISO?: string | null; // 例: 2年後
  minYear?: number; // fallback
  maxYear?: number; // fallback
  onChange?: (iso: string) => void;
};

function ymd(iso?: string | null) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

export default function WheelDatePicker({
  label = "日付",
  name = "scheduleDate",
  defaultValue,
  minDateISO = null,
  maxDateISO = null,
  minYear = 1990,
  maxYear = 2100,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);

  // 現在値
  const def = ymd(defaultValue ?? new Date().toISOString().slice(0, 10))!;
  const [yy, setYY] = useState(def.y);
  const [mm, setMM] = useState(def.m);
  const [dd, setDD] = useState(def.d);

  const min = ymd(minDateISO ?? "");
  const max = ymd(maxDateISO ?? "");

  // 年の候補
  const years = useMemo(() => {
    const y0 = min?.y ?? minYear;
    const y1 = max?.y ?? maxYear;
    return Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  }, [min, max, minYear, maxYear]);

  // 月の候補（年の端では min/max に合わせて絞る）
  const months = useMemo(() => {
    let from = 1,
      to = 12;
    if (min && yy === min.y) from = Math.max(from, min.m);
    if (max && yy === max.y) to = Math.min(to, max.m);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [yy, min, max]);

  // 日の候補（年/月の端では min/max に合わせて絞る）
  const days = useMemo(() => {
    const dim = daysInMonth(yy, mm);
    let from = 1,
      to = dim;
    if (min && yy === min.y && mm === min.m) from = Math.max(from, min.d);
    if (max && yy === max.y && mm === max.m) to = Math.min(to, max.d);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [yy, mm, min, max]);

  // 範囲外の選択値を自動補正
  useEffect(() => {
    if (!months.includes(mm)) setMM(months[0]);
  }, [months, mm]);
  useEffect(() => {
    if (!days.includes(dd)) setDD(days[0]);
  }, [days, dd]);

  const containerH = 240;
  const itemH = 40;
  const pad = (containerH - itemH) / 2;

  const yRef = useRef<HTMLDivElement | null>(null);
  const mRef = useRef<HTMLDivElement | null>(null);
  const dRef = useRef<HTMLDivElement | null>(null);
  const yTimer = useRef<number | null>(null);
  const mTimer = useRef<number | null>(null);
  const dTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (yRef.current) yRef.current.scrollTop = years.indexOf(yy) * itemH;
    if (mRef.current) mRef.current.scrollTop = months.indexOf(mm) * itemH;
    if (dRef.current) dRef.current.scrollTop = days.indexOf(dd) * itemH;
  }, [open, years, months, days, yy, mm, dd]); // 初期スクロール

  const snap = (
    ref: React.RefObject<HTMLDivElement | null>,
    list: number[],
    setter: (n: number) => void
  ) => {
    if (!ref.current || !list.length) return;
    const i = Math.round(ref.current.scrollTop / itemH);
    const idx = Math.max(0, Math.min(list.length - 1, i));
    ref.current.scrollTo({ top: idx * itemH, behavior: "smooth" });
    setter(list[idx]);
  };
  const arm = (tRef: React.MutableRefObject<number | null>, fn: () => void) => {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => {
      tRef.current = null;
      fn();
    }, 120);
  };

  const iso = `${yy}-${pad2(mm)}-${pad2(dd)}`;

  return (
    <div className="w-full">
      <label className="block text-xs text-neutral-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-left"
      >
        {iso}
      </button>
      <input type="hidden" name={name} value={iso} />

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 text-center text-sm text-neutral-600">
              年　月　日
            </div>

            <div className="relative grid grid-cols-3 gap-3">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y border-neutral-200"
                style={{ height: itemH }}
              />
              <div
                ref={yRef}
                className="h-60 overflow-y-auto rounded-xl border"
                onScroll={() => arm(yTimer, () => snap(yRef, years, setYY))}
              >
                <Col
                  items={years}
                  pad={pad}
                  itemH={itemH}
                  selected={yy}
                  unit="年"
                />
              </div>
              <div
                ref={mRef}
                className="h-60 overflow-y-auto rounded-xl border"
                onScroll={() => arm(mTimer, () => snap(mRef, months, setMM))}
              >
                <Col
                  items={months}
                  pad={pad}
                  itemH={itemH}
                  selected={mm}
                  unit="月"
                />
              </div>
              <div
                ref={dRef}
                className="h-60 overflow-y-auto rounded-xl border"
                onScroll={() => arm(dTimer, () => snap(dRef, days, setDD))}
              >
                <Col
                  items={days}
                  pad={pad}
                  itemH={itemH}
                  selected={dd}
                  unit="日"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
                onClick={() => setOpen(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="rounded-lg border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
                onClick={() => {
                  onChange?.(iso);
                  setOpen(false);
                }}
              >
                決定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Col({
  items,
  pad,
  itemH,
  selected,
  unit,
}: {
  items: number[];
  pad: number;
  itemH: number;
  selected: number;
  unit: "年" | "月" | "日";
}) {
  return (
    <div className="relative">
      <div style={{ height: pad }} aria-hidden />
      <ul className="text-center">
        {items.map((n) => (
          <li
            key={n}
            className={`py-2 ${
              n === selected ? "text-neutral-900" : "text-neutral-400"
            }`}
            style={{ height: itemH }}
          >
            {n} {unit}
          </li>
        ))}
      </ul>
      <div style={{ height: pad }} aria-hidden />
    </div>
  );
}
