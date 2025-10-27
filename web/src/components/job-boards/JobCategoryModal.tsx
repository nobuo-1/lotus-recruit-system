// web/src/components/job-boards/JobCategoryModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

type Props = {
  large: string[];
  small: string[];
  onApplyAction: (large: string[], small: string[]) => void;
  onCloseAction: () => void;
};

export default function JobCategoryModal({
  large,
  small,
  onApplyAction,
  onCloseAction,
}: Props) {
  const [L, setL] = useState<string[]>(large);
  const [S, setS] = useState<string[]>(small);
  const [activeL, setActiveL] = useState<string>(large[0] || JOB_LARGE[0]);

  // 表示対象の大分類（未選択なら全表示）
  const visibleLarge = useMemo(() => (L.length ? L : JOB_LARGE), [L]);

  useEffect(() => {
    if (!visibleLarge.includes(activeL)) setActiveL(visibleLarge[0]);
  }, [visibleLarge]); // eslint-disable-line

  const toggleLarge = (v: string) =>
    setL((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );

  const toggleSmall = (v: string, parent: string) => {
    setS((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
    // 小分類を選んだら親も選択状態に
    setL((prev) => (prev.includes(parent) ? prev : [...prev, parent]));
  };

  const selectAllLarge = () => {
    setL([...JOB_LARGE]);
    // 大分類全選択 → 小分類も全選択
    const allSm = new Set<string>();
    JOB_LARGE.forEach((lg) =>
      (JOB_CATEGORIES[lg] || []).forEach((sm) => allSm.add(sm))
    );
    setS(Array.from(allSm));
  };

  const clearAll = () => {
    setL([]);
    setS([]);
  };

  // 右ペインに見出しグループで出す
  const rightGroups = visibleLarge;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[980px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200">
        {/* ヘッダ */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="font-semibold">職種選択</div>
          <button
            onClick={onCloseAction}
            className="rounded-lg px-2 py-1 border border-neutral-200 hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>

        {/* 本体：固定高 → 内部スクロール */}
        <div className="p-4 grid grid-cols-12 gap-4" style={{ height: "70vh" }}>
          {/* 左：大分類 */}
          <div className="col-span-4 flex flex-col overflow-hidden">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm">
                <input
                  type="checkbox"
                  className="mr-2 align-middle"
                  checked={L.length === JOB_LARGE.length}
                  onChange={(e) =>
                    e.target.checked ? selectAllLarge() : clearAll()
                  }
                />
                大分類 すべて選択 / 解除
              </label>
            </div>

            {/* 独立スクロール */}
            <div className="rounded-xl border border-neutral-200 divide-y overflow-auto flex-1">
              {JOB_LARGE.map((lg) => {
                const checked = L.includes(lg);
                const isActive = activeL === lg;
                return (
                  <div
                    key={lg}
                    onClick={() => setActiveL(lg)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                      isActive ? "bg-neutral-100" : "bg-white"
                    }`}
                    style={{
                      // 一番上/下で枠が欠けて見えないように角をわずかに丸める
                      borderTopLeftRadius:
                        lg === JOB_LARGE[0] ? "10px" : undefined,
                      borderTopRightRadius:
                        lg === JOB_LARGE[0] ? "10px" : undefined,
                      borderBottomLeftRadius:
                        lg === JOB_LARGE[JOB_LARGE.length - 1]
                          ? "10px"
                          : undefined,
                      borderBottomRightRadius:
                        lg === JOB_LARGE[JOB_LARGE.length - 1]
                          ? "10px"
                          : undefined,
                    }}
                  >
                    <div className="text-sm font-medium text-neutral-800">
                      {lg}
                    </div>
                    <input
                      type="checkbox"
                      checked={!!checked}
                      onChange={() => toggleLarge(lg)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右：小分類 */}
          <div className="col-span-8 flex flex-col overflow-hidden">
            <div className="mb-2 text-sm font-semibold text-neutral-800">
              小分類
            </div>

            {/* 独立スクロール */}
            <div className="rounded-xl border border-neutral-200 p-3 overflow-auto flex-1">
              {rightGroups.map((grp) => (
                <div key={grp} className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-indigo-700">
                      {grp}
                    </div>
                    <div className="text-xs text-neutral-500">
                      （{(JOB_CATEGORIES[grp] || []).length}件）
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(JOB_CATEGORIES[grp] || []).map((sm) => (
                      <label
                        key={`${grp}-${sm}`}
                        className="inline-flex items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={S.includes(sm)}
                          onChange={() => toggleSmall(sm, grp)}
                        />
                        <span className="text-sm">{sm}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 text-xs text-neutral-500">
              ※ 小分類を選ぶと親の大分類も自動的に選択されます。
            </div>
          </div>
        </div>

        {/* フッタ */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200">
          <button
            onClick={clearAll}
            className="rounded-lg px-3 py-1 border border-neutral-200 text-sm hover:bg-neutral-50"
          >
            解除
          </button>
          <button
            onClick={() => onApplyAction(L, S)}
            className="rounded-lg px-3 py-1 border border-neutral-200 text-sm hover:bg-neutral-50"
          >
            適用して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
