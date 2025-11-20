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
  /** 適用（決定）時に呼ばれる。自社小分類IDの配列を返す */
  onApply: (selectedSmallIds: string[]) => void;
  /** すでに選択済みの小分類ID（編集時など） */
  initialSelectedSmallIds?: string[];
};

export function JobCategoryModal(props: JobCategoryModalProps) {
  const { onClose, onApply, initialSelectedSmallIds = [] } = props;

  const [activeLargeId, setActiveLargeId] = useState<string>(
    JOB_CATEGORY_TREE[0]?.id ?? ""
  );

  const [selectedSmallIds, setSelectedSmallIds] = useState<Set<string>>(
    () => new Set(initialSelectedSmallIds)
  );

  const activeLarge: JobLargeCategory | undefined = useMemo(
    () => JOB_CATEGORY_TREE.find((l) => l.id === activeLargeId),
    [activeLargeId]
  );

  const handleToggleSmall = (smallId: string) => {
    setSelectedSmallIds((prev) => {
      const next = new Set(prev);
      if (next.has(smallId)) {
        next.delete(smallId);
      } else {
        next.add(smallId);
      }
      return next;
    });
  };

  const handleApply = () => {
    onApply(Array.from(selectedSmallIds));
    onClose();
  };

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
                  <span>{large.name}</span>
                  {/* 任意で「選択中」ラベル */}
                  {large.smallCategories.some((s) =>
                    selectedSmallIds.has(s.id)
                  ) && (
                    <span className="rounded bg-blue-100 px-2 text-xs text-blue-700">
                      選択中
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 右側：小分類（=中分類）リスト */}
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
                            onChange={() => handleToggleSmall(small.id)}
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
