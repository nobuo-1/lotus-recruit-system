// web/src/components/job-boards/JobCategoryModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

/**
 * 大分類を押すとハイライト＆右ペインの小分類が切替
 * 小分類は「チップ」方式でトグル選択（チェックボックスは使わない）
 * 既存選択は初期値に反映。画面サイズで見切れないよう max-h + overflow
 */
export default function JobCategoryModal({
  initialLarge,
  initialSmall,
  onCloseAction,
  onApplyAction,
}: {
  initialLarge: string[];
  initialSmall: string[];
  onCloseAction: () => void;
  onApplyAction: (L: string[], S: string[]) => void;
}) {
  const [L, setL] = useState<string[]>(initialLarge ?? []);
  const [S, setS] = useState<string[]>(initialSmall ?? []);
  const [activeLarge, setActiveLarge] = useState<string>(
    (initialLarge?.[0] as string) || JOB_LARGE[0]
  );

  // 大分類トグル
  const toggleLarge = (v: string) =>
    setL((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );

  // 右ペインに出すのは「現在アクティブの大分類」のみ
  const smallOptions = useMemo(
    () => JOB_CATEGORIES[activeLarge] ?? [],
    [activeLarge]
  );

  // チップ
  const Chip: React.FC<{
    active: boolean;
    label: string;
    onClick: () => void;
  }> = ({ active, label, onClick }) => (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );

  // 小分類トグル（チップ）
  const toggleSmall = (v: string) =>
    setS((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );

  // 既存選択の反映（モーダル開時に一度だけ）
  useEffect(() => {
    setL(initialLarge ?? []);
    setS(initialSmall ?? []);
  }, []); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="w-[980px] max-w-[96vw] rounded-2xl bg-white shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">職種の選択</div>
          <button
            onClick={onCloseAction}
            className="rounded-lg px-2 py-1 border hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>

        {/* 本体 */}
        <div className="p-4 grid grid-cols-12 gap-4">
          {/* 左ペイン：大分類（押下でアクティブ切替 & トグル） */}
          <div className="col-span-4">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setL([...JOB_LARGE])}
                className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
              >
                大分類 すべて選択
              </button>
              <button
                onClick={() => setL([])}
                className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
              >
                解除
              </button>
            </div>

            <div className="rounded-xl border divide-y max-h-[520px] overflow-auto">
              {JOB_LARGE.map((lg) => {
                const picked = L.includes(lg);
                const active = activeLarge === lg;
                return (
                  <div
                    key={lg}
                    onClick={() => setActiveLarge(lg)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                      active ? "bg-neutral-50" : ""
                    }`}
                  >
                    <div className="text-sm font-medium">{lg}</div>
                    <button
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        picked
                          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                          : "border-neutral-300 text-neutral-600"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLarge(lg);
                      }}
                    >
                      {picked ? "選択中" : "選択"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右ペイン：小分類（activeLarge のみ表示、チップでトグル） */}
          <div className="col-span-8">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-neutral-800">
                小分類（{activeLarge}）
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const union = new Set<string>(S);
                    (smallOptions || []).forEach((x) => union.add(x));
                    setS(Array.from(union));
                  }}
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
                >
                  すべて選択
                </button>
                <button
                  onClick={() => {
                    const rest = new Set<string>(S);
                    (smallOptions || []).forEach((x) => rest.delete(x));
                    setS(Array.from(rest));
                  }}
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
                >
                  解除
                </button>
              </div>
            </div>

            <div className="rounded-xl border p-3 max-h-[520px] overflow-auto">
              <div className="grid grid-cols-2 gap-2">
                {(smallOptions || []).map((s) => (
                  <Chip
                    key={`${activeLarge}-${s}`}
                    label={s}
                    active={S.includes(s)}
                    onClick={() => toggleSmall(s)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-2 text-xs text-neutral-500">
              ※ 左の大分類を押すと、右側の小分類リストが切り替わります。
            </div>
          </div>
        </div>

        {/* フッター */}
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
  );
}
