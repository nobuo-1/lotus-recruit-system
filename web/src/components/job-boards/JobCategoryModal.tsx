// web/src/components/job-boards/JobCategoryModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

type Props = {
  large: string[];
  small: string[];
  onCloseAction: () => void;
  onApplyAction: (L: string[], S: string[]) => void;
};

export default function JobCategoryModal({
  large,
  small,
  onCloseAction,
  onApplyAction,
}: Props) {
  // 初期選択を反映
  const [L, setL] = useState<string[]>(large ?? []);
  const [S, setS] = useState<string[]>(small ?? []);
  const [activeL, setActiveL] = useState<string>(L[0] || JOB_LARGE[0]);

  useEffect(() => {
    setL(large ?? []);
    setS(small ?? []);
    if (large?.length) setActiveL(large[0]);
  }, [large, small]);

  // アクティブ群（右側に出す対象＝常に1グループ）
  const rightGroup = activeL;

  const toggleLarge = (lg: string) => {
    const checked = !L.includes(lg);
    const nextL = checked ? [...L, lg] : L.filter((x) => x !== lg);
    setL(nextL);

    // 大分類の ON/OFF で配下小分類を一括
    const children = JOB_CATEGORIES[lg] ?? [];
    if (checked) {
      const union = new Set<string>([...S, ...children]);
      setS(Array.from(union));
    } else {
      setS(S.filter((x) => !children.includes(x)));
    }
  };

  const toggleSmall = (sm: string) =>
    setS(S.includes(sm) ? S.filter((x) => x !== sm) : [...S, sm]);

  // 「大分類 すべて選択/解除」
  const allLarge = L.length === JOB_LARGE.length;
  const toggleAllLarge = (checked: boolean) => {
    if (checked) {
      setL([...JOB_LARGE]);
      // 全小分類も ON
      const allSm = JOB_LARGE.flatMap((lg) => JOB_CATEGORIES[lg] || []);
      setS(allSm);
    } else {
      setL([]);
      setS([]);
    }
  };

  // アクティブ大分類グループ内の全小分類が選ばれているか
  const activeAllSmall =
    (JOB_CATEGORIES[rightGroup] || []).every((sm) => S.includes(sm)) &&
    (JOB_CATEGORIES[rightGroup] || []).length > 0;

  const toggleActiveAllSmall = (checked: boolean) => {
    const children = JOB_CATEGORIES[rightGroup] || [];
    if (checked) {
      const union = new Set<string>([...S, ...children]);
      setS(Array.from(union));
      if (!L.includes(rightGroup)) setL([...L, rightGroup]); // 大分類もON
    } else {
      setS(S.filter((x) => !children.includes(x)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[980px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="font-semibold">職種選択</div>
          <button
            onClick={onCloseAction}
            className="rounded-lg px-2 py-1 border border-neutral-300 hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>

        <div className="grid grid-cols-12 gap-4 p-4">
          {/* 左：大分類（独立スクロール） */}
          <div className="col-span-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm inline-flex items-center">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={allLarge}
                  onChange={(e) => toggleAllLarge(e.target.checked)}
                />
                大分類 すべて選択
              </label>
            </div>
            <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-200 max-h-[520px] overflow-auto">
              {JOB_LARGE.map((lg, idx) => {
                const checked = L.includes(lg);
                const active = activeL === lg;
                return (
                  <div
                    key={lg}
                    onClick={() => setActiveL(lg)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                      active ? "bg-neutral-100" : "bg-white"
                    }`}
                  >
                    {/* 左端の角丸切れ対策：1行目/最終行の境界を余白で確保 */}
                    <div className="text-sm font-medium">{lg}</div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLarge(lg)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右：小分類（独立スクロール、アクティブ大分類のみ） */}
          <div className="col-span-8">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-neutral-800">
                小分類（{rightGroup}）
              </div>
              <label className="text-sm inline-flex items-center">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={activeAllSmall}
                  onChange={(e) => toggleActiveAllSmall(e.target.checked)}
                />
                表示中の小分類をすべて選択/解除
              </label>
            </div>

            <div className="rounded-xl border border-neutral-200 p-3 max-h-[520px] overflow-auto">
              <div className="grid grid-cols-2 gap-2">
                {(JOB_CATEGORIES[rightGroup] || []).map((sm) => (
                  <label key={sm} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={S.includes(sm)}
                      onChange={() => toggleSmall(sm)}
                    />
                    <span className="text-sm">{sm}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200">
          <button
            onClick={() => {
              setL([]);
              setS([]);
            }}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            クリア
          </button>
          <button
            onClick={() => onApplyAction(L, S)}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            適用して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
