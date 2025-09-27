"use client";
import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  label?: string;
  nameHour?: string;
  nameMinute?: string;
  defaultHour?: number; // 0-23
  defaultMinute?: number; // 0-59
  onChange?: (h: number, m: number) => void;

  /** 当日チェック用：選択中の日付（YYYY-MM-DD） */
  selectedDateISO?: string;
  /** 当日チェック用：最小許容日（通常は今日の YYYY-MM-DD） */
  minForDateISO?: string;
};

export default function WheelTimePicker({
  label = "時刻",
  nameHour = "hour",
  nameMinute = "minute",
  defaultHour = 10,
  defaultMinute = 0,
  onChange,
  selectedDateISO,
  minForDateISO,
}: Props) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(defaultHour);
  const [m, setM] = useState(defaultMinute);

  // レイアウト定数（UIは変更しません）
  const containerH = 240;
  const itemH = 40;
  const pad = (containerH - itemH) / 2;

  // 「当日」かどうか（当日のみ現在より前を禁止）
  const isToday =
    selectedDateISO && minForDateISO
      ? selectedDateISO === minForDateISO
      : false;

  const now = new Date();
  const minHour = isToday ? now.getHours() : 0;
  const minMinuteThisHour = isToday ? now.getMinutes() : 0;

  // 候補の時間（当日は現在時刻以降のみ）
  const hours = useMemo(
    () => Array.from({ length: 24 - minHour }, (_, i) => i + minHour),
    [minHour]
  );

  // 候補の分（当日の最小時のみ、現在分以降に制限）
  const minutes = useMemo(() => {
    const start = isToday && h === minHour ? minMinuteThisHour : 0;
    return Array.from({ length: 60 - start }, (_, i) => i + start);
  }, [isToday, h, minHour, minMinuteThisHour]);

  const hRef = useRef<HTMLDivElement | null>(null);
  const mRef = useRef<HTMLDivElement | null>(null);
  const hTimer = useRef<number | null>(null);
  const mTimer = useRef<number | null>(null);

  // モーダルを開いた時にスクロール位置を合わせる
  useEffect(() => {
    if (!open) return;
    if (hRef.current) hRef.current.scrollTop = Math.max(0, h - minHour) * itemH;
    const start = isToday && h === minHour ? minMinuteThisHour : 0;
    if (mRef.current) mRef.current.scrollTop = Math.max(0, m - start) * itemH;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 日付が切り替わったら、最小値に収まるように補正
  useEffect(() => {
    if (!isToday) return;
    if (h < minHour) setH(minHour);
    if (h === minHour && m < minMinuteThisHour) setM(minMinuteThisHour);
  }, [isToday, h, m, minHour, minMinuteThisHour]);

  const snap = (
    ref: React.RefObject<HTMLDivElement | null>,
    list: number[],
    setter: (n: number) => void
  ) => {
    if (!ref.current) return;
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

  const pad2 = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="w-full">
      <label className="block text-xs text-neutral-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-left"
      >
        {pad2(h)} : {pad2(m)}
      </button>
      <input type="hidden" name={nameHour} value={h} />
      <input type="hidden" name={nameMinute} value={m} />

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 text-center text-sm text-neutral-600">
              時　分
            </div>

            <div className="relative grid grid-cols-2 gap-3">
              {/* センタールーラー */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y border-neutral-200"
                style={{ height: itemH }}
              />
              {/* 時 */}
              <div
                ref={hRef}
                className="h-60 overflow-y-auto rounded-xl border"
                onScroll={() =>
                  arm(hTimer, () =>
                    snap(hRef, hours, (val) => {
                      setH(val);
                      // 分の下限に満たない場合は補正
                      if (isToday && val === minHour && m < minMinuteThisHour) {
                        setM(minMinuteThisHour);
                        if (mRef.current) {
                          mRef.current.scrollTo({
                            top: 0,
                            behavior: "smooth",
                          });
                        }
                      }
                    })
                  )
                }
              >
                <Col
                  items={hours}
                  pad={pad}
                  itemH={itemH}
                  selected={h}
                  unit="時"
                />
              </div>
              {/* 分 */}
              <div
                ref={mRef}
                className="h-60 overflow-y-auto rounded-xl border"
                onScroll={() => arm(mTimer, () => snap(mRef, minutes, setM))}
              >
                <Col
                  items={minutes}
                  pad={pad}
                  itemH={itemH}
                  selected={m}
                  unit="分"
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
                  onChange?.(h, m);
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
  unit: "時" | "分";
}) {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="relative">
      <div style={{ height: pad }} aria-hidden />
      <ul className="text-center">
        {items.map((n) => (
          <li
            key={`${unit}-${n}`}
            className={`py-2 ${
              n === selected ? "text-neutral-900" : "text-neutral-400"
            }`}
            style={{ height: itemH }}
          >
            {pad2(n)} {unit}
          </li>
        ))}
      </ul>
      <div style={{ height: pad }} aria-hidden />
    </div>
  );
}
