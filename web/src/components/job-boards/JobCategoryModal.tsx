// web/src/components/job-boards/JobCategoryModal.tsx
"use client";

import React, { useMemo, useState } from "react";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

export type JobCatValue = { large: string[]; small: string[] };

export default function JobCategoryModal({
  open,
  value,
  onChangeAction,
  onCloseAction,
}: {
  open: boolean;
  value: JobCatValue;
  onChangeAction: (v: JobCatValue) => void;
  onCloseAction: () => void;
}) {
  const [activeLarge, setActiveLarge] = useState<string>(
    value.large[0] || JOB_LARGE[0]
  );
  const smalls = useMemo(
    () => JOB_CATEGORIES[activeLarge] ?? [],
    [activeLarge]
  );

  if (!open) return null;

  const toggleLarge = (lg: string) => {
    const exists = value.large.includes(lg);
    const nextLg = exists
      ? value.large.filter((x) => x !== lg)
      : [...value.large, lg];
    const ownSmalls = JOB_CATEGORIES[lg] ?? [];
    const nextSm = exists
      ? value.small.filter((s) => !ownSmalls.includes(s))
      : [...value.small, ...ownSmalls.filter((s) => !value.small.includes(s))];
    onChangeAction({ large: nextLg, small: nextSm });
  };

  const toggleSmall = (sm: string) => {
    const exists = value.small.includes(sm);
    const nextSm = exists
      ? value.small.filter((x) => x !== sm)
      : [...value.small, sm];
    const belongLg = Object.entries(JOB_CATEGORIES).find(([, arr]) =>
      arr.includes(sm)
    )?.[0];
    const nextLg =
      belongLg && !value.large.includes(belongLg)
        ? [...value.large, belongLg]
        : value.large;
    onChangeAction({ large: nextLg, small: nextSm });
  };

  const allChecked = smalls.every((s) => value.small.includes(s));
  const toggleAllSmalls = (checked: boolean) => {
    const target = JOB_CATEGORIES[activeLarge] ?? [];
    const base = value.small.filter((s) => !target.includes(s));
    const nextSm = checked ? [...base, ...target] : base;
    const nextLg = checked
      ? Array.from(new Set([...value.large, activeLarge]))
      : value.large.filter((lg) => lg !== activeLarge);
    onChangeAction({ large: nextLg, small: nextSm });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[1000px] max-w-[96vw] rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">職種選択</div>
          <button
            onClick={onCloseAction}
            className="rounded-lg px-2 py-1 border hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 max-h[85vh] md:max-h-[85vh]">
          {/* left large list */}
          <div className="border-r max-h-[85vh] overflow-y-auto">
            {JOB_LARGE.map((lg) => {
              const on = value.large.includes(lg);
              const isActive = activeLarge === lg;
              return (
                <div
                  key={lg}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                    isActive ? "bg-neutral-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleLarge(lg)}
                    />
                    <button
                      className="text-sm text-left text-neutral-800"
                      onClick={() => setActiveLarge(lg)}
                    >
                      {lg}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* right small list */}
          <div className="md:col-span-2 p-3 max-h-[85vh] overflow-y-auto">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium">{activeLarge}</div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => toggleAllSmalls(e.target.checked)}
                />
                すべて選択/解除
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {smalls.map((sm) => {
                const on = value.small.includes(sm);
                return (
                  <label
                    key={sm}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleSmall(sm)}
                    />
                    <span className="text-sm">{sm}</span>
                    <span className="ml-auto text-xs text-neutral-500">
                      ({activeLarge})
                    </span>
                  </label>
                );
              })}
              {smalls.length === 0 && (
                <div className="text-sm text-neutral-500">
                  この大分類に小分類はありません
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t text-right text-xs text-neutral-500">
          選択: 大{value.large.length} / 小{value.small.length}
        </div>
      </div>
    </div>
  );
}
