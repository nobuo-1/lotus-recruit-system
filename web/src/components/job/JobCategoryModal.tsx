// web/src/components/job/JobCategoryModal.tsx
"use client";

import React, { useMemo, useState } from "react";
import {
  JOB_CATEGORY_TREE,
  JobLargeCategory,
  JobSmallCategory,
} from "@/features/jobCategories/jobCategoryTree";

type JobCategoryModalProps = {
  /** モーダルを閉じる時に呼ばれる */
  onClose: () => void;
  /**
   * 適用（決定）時に呼ばれる。
   * - largeIds: 選択された大分類ID
   * - smallIds: 選択された小分類ID
   */
  onApply: (params: { largeIds: string[]; smallIds: string[] }) => void;
  /** すでに選択済みの小分類ID（編集時など） */
  initialSelectedSmallIds?: string[];
  /** すでに選択済みの大分類ID（任意） */
  initialSelectedLargeIds?: string[];
};

export function JobCategoryModal(props: JobCategoryModalProps) {
  const {
    onClose,
    onApply,
    initialSelectedSmallIds = [],
    initialSelectedLargeIds = [],
  } = props;

  /** =========================
   * 初期状態
   * ========================= */

  // 小分類 → 親の大分類IDを引くためのマップ
  const smallToLargeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const large of JOB_CATEGORY_TREE) {
      for (const small of large.smallCategories) {
        m.set(small.id, large.id);
      }
    }
    return m;
  }, []);

  // 大分類の初期セット
  const [selectedLargeIds, setSelectedLargeIds] = useState<Set<string>>(() => {
    // 明示的に渡された大分類があればそれを優先
    const base = new Set(initialSelectedLargeIds);

    // 小分類の初期選択から親の大分類もONにしておく
    for (const smallId of initialSelectedSmallIds) {
      const parentLargeId = smallToLargeMap.get(smallId);
      if (parentLargeId) base.add(parentLargeId);
    }
    return base;
  });

  // 小分類の選択セット
  const [selectedSmallIds, setSelectedSmallIds] = useState<Set<string>>(
    () => new Set(initialSelectedSmallIds)
  );

  // 左ペインでアクティブな大分類
  const [activeLargeId, setActiveLargeId] = useState<string>(
    // すでに選択済みの大分類があればそこを優先、なければ先頭
    initialSelectedLargeIds[0] || JOB_CATEGORY_TREE[0]?.id || ""
  );

  const activeLarge: JobLargeCategory | undefined = useMemo(
    () => JOB_CATEGORY_TREE.find((l) => l.id === activeLargeId),
    [activeLargeId]
  );

  /** =========================
   * 大分類のON/OFF
   * ========================= */

  const handleToggleLarge = (largeId: string, checked: boolean) => {
    const large = JOB_CATEGORY_TREE.find((l) => l.id === largeId);
    if (!large) return;

    setSelectedLargeIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(largeId);
      } else {
        next.delete(largeId);
      }
      return next;
    });

    // 大分類ON → 子の小分類もすべてON
    // 大分類OFF → 子の小分類はすべてOFF
    setSelectedSmallIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const s of large.smallCategories) {
          next.add(s.id);
        }
      } else {
        for (const s of large.smallCategories) {
          next.delete(s.id);
        }
      }
      return next;
    });
  };

  /** =========================
   * 小分類のON/OFF
   * ========================= */

  const handleToggleSmall = (smallId: string, checked: boolean) => {
    const parentLargeId = smallToLargeMap.get(smallId);

    setSelectedSmallIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(smallId);
      } else {
        next.delete(smallId);
      }

      // 小分類をONにしたら、必ず親の大分類もON
      if (parentLargeId) {
        setSelectedLargeIds((prevLarge) => {
          const nextLarge = new Set(prevLarge);
          if (checked) {
            nextLarge.add(parentLargeId);
          } else {
            // OFFにした場合、同じ大分類配下に他の小分類が一つも残っていなければ大分類もOFF
            const large = JOB_CATEGORY_TREE.find((l) => l.id === parentLargeId);
            if (large) {
              const hasOtherSelected = large.smallCategories.some((s) =>
                next.has(s.id)
              );
              if (!hasOtherSelected) {
                nextLarge.delete(parentLargeId);
              }
            }
          }
          return nextLarge;
        });
      }

      return next;
    });
  };

  /** =========================
   * 適用
   * ========================= */

  const handleApply = () => {
    onApply({
      largeIds: Array.from(selectedLargeIds),
      smallIds: Array.from(selectedSmallIds),
    });
    onClose();
  };

  /** =========================
   * 描画
   * ========================= */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-h-[80vh] w-[900px] rounded-md bg-white shadow-lg flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">職種を選ぶ</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            閉じる
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 左側：大分類リスト */}
          <div className="w-1/3 border-r overflow-y-auto">
            {JOB_CATEGORY_TREE.map((large) => {
              const isActive = large.id === activeLargeId;
              const isChecked = selectedLargeIds.has(large.id);
              const hasAnySmallSelected = large.smallCategories.some((s) =>
                selectedSmallIds.has(s.id)
              );

              return (
                <button
                  key={large.id}
                  type="button"
                  onClick={() => setActiveLargeId(large.id)}
                  className={[
                    "flex w-full items-center justify-between px-3 py-2 text-sm text-left",
                    isActive ? "bg-blue-50 font-semibold" : "hover:bg-gray-50",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={isChecked}
                      onChange={(e) =>
                        handleToggleLarge(large.id, e.target.checked)
                      }
                      onClick={(e) => e.stopPropagation()} // 行クリックと分離
                    />
                    {large.name}
                  </span>
                  {hasAnySmallSelected && (
                    <span className="rounded bg-blue-100 px-2 text-xs text-blue-700">
                      選択中
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 右側：小分類リスト */}
          <div className="w-2/3 overflow-y-auto px-4 py-3">
            {activeLarge ? (
              <>
                <h3 className="mb-3 text-base font-semibold">
                  {activeLarge.name}
                </h3>
                <div className="space-y-2">
                  {activeLarge.smallCategories.map(
                    (small: JobSmallCategory) => {
                      const checked = selectedSmallIds.has(small.id);
                      return (
                        <label
                          key={small.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={(e) =>
                              handleToggleSmall(small.id, e.target.checked)
                            }
                          />
                          <span>{small.name}</span>
                        </label>
                      );
                    }
                  )}
                  {activeLarge.smallCategories.length === 0 && (
                    <p className="text-sm text-gray-500">
                      この大分類には小分類が設定されていません。
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                大分類が選択されていません。
              </p>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            className="rounded border px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={handleApply}
          >
            この条件で絞り込む
          </button>
        </div>
      </div>
    </div>
  );
}
