// web/src/components/job/JobCategoryModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

type JobCategoryModalProps = {
  /** モーダルを閉じる時に呼ばれる */
  onClose: () => void;
  /**
   * 適用（決定）時に呼ばれる。
   * - largeIds: 選択された大分類ID（ここでは大分類ラベルをそのままIDとして扱う）
   * - smallIds: 選択された小分類ID（小分類ラベルのみを返す）
   */
  onApply: (params: { largeIds: string[]; smallIds: string[] }) => void;
  /** すでに選択済みの小分類ID（編集時など） */
  initialSelectedSmallIds?: string[];
  /** すでに選択済みの大分類ID（任意） */
  initialSelectedLargeIds?: string[];
};

const SEP = ":::";
const enc = (lg: string, sm: string) => `${lg}${SEP}${sm}`;
const isComposite = (v: string) => v.includes(SEP);

export function JobCategoryModal(props: JobCategoryModalProps) {
  const {
    onClose,
    onApply,
    initialSelectedSmallIds = [],
    initialSelectedLargeIds = [],
  } = props;

  // 大分類の選択
  const [L, setL] = useState<string[]>(initialSelectedLargeIds ?? []);
  // 小分類は合成キー "大分類:::小分類" で内部管理
  const [SKeys, setSKeys] = useState<Set<string>>(new Set());
  // 右側で表示するアクティブ大分類
  const [activeL, setActiveL] = useState<string>(
    initialSelectedLargeIds[0] || JOB_LARGE[0]
  );

  /** =========================
   * 初期値の取り込み
   * ========================= */
  useEffect(() => {
    const large = initialSelectedLargeIds ?? [];
    const small = initialSelectedSmallIds ?? [];
    setL(large);

    const provided = Array.isArray(small) ? small : [];
    const hasComposite = provided.some(isComposite);

    const next = new Set<string>();

    if (hasComposite) {
      // すでに "大分類:::小分類" 形式で渡されている場合はそのまま採用
      for (const k of provided) {
        if (!isComposite(k)) continue;
        const [lg, sm] = k.split(SEP);
        if (JOB_LARGE.includes(lg) && (JOB_CATEGORIES[lg] || []).includes(sm)) {
          next.add(enc(lg, sm));
        }
      }
    } else {
      // 従来形式（小分類ラベルのみ）の後方互換:
      // initialSelectedLargeIds に含まれる大分類の配下から、同名の小分類だけを合成キー化
      for (const lg of large) {
        const children = JOB_CATEGORIES[lg] || [];
        for (const sm of provided) {
          if (children.includes(sm)) {
            next.add(enc(lg, sm));
          }
        }
      }
    }

    setSKeys(next);

    if (large.length > 0) setActiveL(large[0]);
    else setActiveL(JOB_LARGE[0]);
  }, [initialSelectedLargeIds, initialSelectedSmallIds]);

  /** =========================
   * 大分類のON/OFF
   * ========================= */

  const toggleLarge = (lg: string) => {
    const checked = !L.includes(lg);
    const nextL = checked ? [...L, lg] : L.filter((x) => x !== lg);
    setL(nextL);

    const children = JOB_CATEGORIES[lg] ?? [];
    setSKeys((cur) => {
      const next = new Set(cur);
      if (checked) {
        for (const sm of children) next.add(enc(lg, sm));
      } else {
        for (const sm of children) next.delete(enc(lg, sm));
      }
      return next;
    });
  };

  /** 「大分類 すべて選択/解除」 */
  const allLarge = L.length === JOB_LARGE.length;
  const toggleAllLarge = (checked: boolean) => {
    if (checked) {
      setL([...JOB_LARGE]);
      const allSmKeys = JOB_LARGE.flatMap((lg) =>
        (JOB_CATEGORIES[lg] || []).map((sm) => enc(lg, sm))
      );
      setSKeys(new Set(allSmKeys));
    } else {
      setL([]);
      setSKeys(new Set());
    }
  };

  /** =========================
   * 小分類のON/OFF（アクティブ大分類のみ対象）
   * ========================= */

  const toggleSmall = (sm: string) => {
    const key = enc(activeL, sm);
    setSKeys((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // アクティブ大分類グループ内の全小分類が選ばれているか
  const activeChildren = JOB_CATEGORIES[activeL] || [];
  const activeAllSmall =
    activeChildren.every((sm) => SKeys.has(enc(activeL, sm))) &&
    activeChildren.length > 0;

  const toggleActiveAllSmall = (checked: boolean) => {
    const children = JOB_CATEGORIES[activeL] || [];
    setSKeys((cur) => {
      const next = new Set(cur);
      if (checked) {
        for (const sm of children) next.add(enc(activeL, sm));
        // 小分類をすべてONにしたら、大分類もONにしておく
        if (!L.includes(activeL)) {
          setL((prev) => [...prev, activeL]);
        }
      } else {
        for (const sm of children) next.delete(enc(activeL, sm));
      }
      return next;
    });
  };

  /** =========================
   * クリア & 適用
   * ========================= */

  const handleClear = () => {
    setL([]);
    setSKeys(new Set());
  };

  const handleApply = () => {
    const largeIds = [...L];
    // smallIds は「小分類ラベルのみ」を返す（重複が気になる場合はここを composite に変えてもOK）
    const smallIds = Array.from(SKeys).map((key) => {
      const parts = key.split(SEP);
      return parts[1] ?? key;
    });

    onApply({ largeIds, smallIds });
    onClose();
  };

  /** =========================
   * 描画
   * ========================= */

  const rightGroup = activeL;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[980px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="font-semibold">職種選択</div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 border border-neutral-300 hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>

        {/* 本体：左＝大分類 / 右＝小分類 */}
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
              {JOB_LARGE.map((lg) => {
                const checked = L.includes(lg);
                const active = rightGroup === lg;
                return (
                  <div
                    key={lg}
                    onClick={() => setActiveL(lg)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                      active ? "bg-neutral-100" : "bg-white"
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
                      checked={SKeys.has(enc(rightGroup, sm))}
                      onChange={() => toggleSmall(sm)}
                    />
                    <span className="text-sm">{sm}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200">
          <button
            onClick={handleClear}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            クリア
          </button>
          <button
            onClick={handleApply}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            適用して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
