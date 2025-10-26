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
  const [L, setL] = useState<string[]>(large ?? []);
  const [S, setS] = useState<string[]>(small ?? []);
  const [activeL, setActiveL] = useState<string>(large[0] || JOB_LARGE[0]);

  useEffect(() => {
    if (!JOB_LARGE.includes(activeL)) setActiveL(JOB_LARGE[0]);
  }, [activeL]);

  const toggleLarge = (lg: string) => {
    const next = L.includes(lg) ? L.filter((x) => x !== lg) : [...L, lg];
    setL(next);
    if (!next.includes(lg)) {
      const rest = new Set(S);
      (JOB_CATEGORIES[lg] || []).forEach((sm) => rest.delete(sm));
      setS(Array.from(rest));
    }
  };

  const toggleSmall = (lg: string, sm: string) => {
    const has = S.includes(sm);
    setS(has ? S.filter((x) => x !== sm) : [...S, sm]);
    if (!L.includes(lg)) setL([...L, lg]);
  };

  const allSmallSelectedForActive = useMemo<boolean>(() => {
    const targets = JOB_CATEGORIES[activeL] || [];
    if (targets.length === 0) return false;
    return targets.every((x) => S.includes(x));
  }, [activeL, S]);

  const setAllSmallForActive = (checked: boolean) => {
    const targets = JOB_CATEGORIES[activeL] || [];
    if (targets.length === 0) return;
    if (checked) {
      const union = new Set([...S, ...targets]);
      setS(Array.from(union));
      if (!L.includes(activeL)) setL([...L, activeL]);
    } else {
      setS(S.filter((x) => !targets.includes(x)));
    }
  };

  const setAllLarge = (checked: boolean) => {
    if (checked) {
      setL([...JOB_LARGE]);
      const union = new Set<string>();
      JOB_LARGE.forEach((lg) =>
        (JOB_CATEGORIES[lg] || []).forEach((sm) => union.add(sm))
      );
      setS(Array.from(union));
    } else {
      setL([]);
      setS([]);
    }
  };

  const SmallChip: React.FC<{
    active: boolean;
    label: string;
    onClick: () => void;
  }> = ({ active, label, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border mr-2 mb-2 ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    // 画面サイズで見切れないように：外側を scroll 可、内側を最大 90vh に固定
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-[980px] max-w-[96vw] max-h-[90vh] rounded-2xl bg-white shadow-xl flex flex-col">
          {/* ヘッダ */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="font-semibold">職種選択</div>
            <button
              onClick={onCloseAction}
              className="rounded-lg px-2 py-1 border hover:bg-neutral-50 text-sm"
            >
              閉じる
            </button>
          </div>

          {/* 本体：内部のみスクロール */}
          <div className="p-4 grid grid-cols-12 gap-4 overflow-y-auto">
            {/* 左：大分類（選択中の行をやや濃いグレーに） */}
            <div className="col-span-12 md:col-span-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={L.length === JOB_LARGE.length}
                    onChange={(e) => setAllLarge(e.target.checked)}
                  />
                  大分類 すべて選択
                </label>
              </div>
              <div className="rounded-xl border divide-y">
                {JOB_LARGE.map((lg) => {
                  const checked = L.includes(lg);
                  const isActive = activeL === lg;
                  return (
                    <div
                      key={lg}
                      onClick={() => setActiveL(lg)}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                        isActive ? "bg-neutral-200" : ""
                      }`}
                    >
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

            {/* 右：アクティブ大分類の小分類だけを表示（チップ選択式） */}
            <div className="col-span-12 md:col-span-8">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-neutral-800">
                  小分類（{activeL}）
                </div>
                <label className="text-sm">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={!!activeL && allSmallSelectedForActive}
                    onChange={(e) => setAllSmallForActive(e.target.checked)}
                  />
                  表示中の小分類をすべて選択/解除
                </label>
              </div>
              <div className="rounded-xl border p-3 max-h-[60vh] overflow-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(JOB_CATEGORIES[activeL] || []).map((sm) => (
                    <SmallChip
                      key={`${activeL}-${sm}`}
                      active={S.includes(sm)}
                      label={sm}
                      onClick={() => toggleSmall(activeL, sm)}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                ※ 小分類を選択すると、その配下の大分類も自動的に選択されます。
              </div>
            </div>
          </div>

          {/* フッタ */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
            <button
              onClick={() => {
                setL([]);
                setS([]);
              }}
              className="rounded-lg px-3 py-1 border text-sm"
            >
              クリア
            </button>
            <button
              onClick={() => onApplyAction(L, S)}
              className="rounded-lg px-3 py-1 border text-sm hover:bg-neutral-50"
            >
              適用して閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
