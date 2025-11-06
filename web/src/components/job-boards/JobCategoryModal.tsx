// web/src/components/job-boards/JobCategoryModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

type Props = {
  large: string[];
  small: string[]; // 合成キー "大分類:::小分類" または 従来の小分類ラベルのみ（後方互換）
  onCloseAction: () => void;
  onApplyAction: (L: string[], S: string[]) => void; // S は合成キー配列を返す
};

const SEP = ":::";
const enc = (lg: string, sm: string) => `${lg}${SEP}${sm}`;
const isComposite = (v: string) => v.includes(SEP);

export default function JobCategoryModal({
  large,
  small,
  onCloseAction,
  onApplyAction,
}: Props) {
  // 初期選択を反映（大分類は従来通り）
  const [L, setL] = useState<string[]>(large ?? []);

  // 小分類は合成キーで内部管理（例: "ITエンジニア:::その他"）
  const [SKeys, setSKeys] = useState<Set<string>>(new Set());

  // 右側に出す対象＝常に1グループ（従来デザインのまま）
  const [activeL, setActiveL] = useState<string>(L[0] || JOB_LARGE[0]);

  // small 初期値の取り込み（合成キー優先。従来の小分類ラベルのみが来た場合は、large に含まれる大分類配下にだけ割り当て）
  useEffect(() => {
    setL(large ?? []);

    const provided = Array.isArray(small) ? small : [];
    const hasComposite = provided.some(isComposite);

    const next = new Set<string>();
    if (hasComposite) {
      for (const k of provided) {
        if (!isComposite(k)) continue;
        const [lg, sm] = k.split(SEP);
        if (JOB_LARGE.includes(lg) && (JOB_CATEGORIES[lg] || []).includes(sm)) {
          next.add(enc(lg, sm));
        }
      }
    } else {
      // 従来形式（小分類ラベルのみ）の後方互換:
      // すでに選択済みの大分類 L の配下にある同名の小分類だけを合成キー化
      for (const lg of large ?? []) {
        const children = JOB_CATEGORIES[lg] || [];
        for (const sm of provided) {
          if (children.includes(sm)) next.add(enc(lg, sm));
        }
      }
    }
    setSKeys(next);

    if ((large?.length ?? 0) > 0) setActiveL(large![0]);
    else setActiveL(JOB_LARGE[0]);
  }, [large, small]);

  // アクティブ群（右側に出す対象＝常に1グループ）
  const rightGroup = activeL;

  // 大分類の ON/OFF で配下小分類を一括
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

  // 小分類 ON/OFF（アクティブ大分類にだけ作用。名称の衝突は合成キーで分離）
  const toggleSmall = (sm: string) => {
    const key = enc(rightGroup, sm);
    setSKeys((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 「大分類 すべて選択/解除」
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

  // アクティブ大分類グループ内の全小分類が選ばれているか
  const activeAllSmall =
    (JOB_CATEGORIES[rightGroup] || []).every((sm) =>
      SKeys.has(enc(rightGroup, sm))
    ) && (JOB_CATEGORIES[rightGroup] || []).length > 0;

  const toggleActiveAllSmall = (checked: boolean) => {
    const children = JOB_CATEGORIES[rightGroup] || [];
    setSKeys((cur) => {
      const next = new Set(cur);
      if (checked) {
        for (const sm of children) next.add(enc(rightGroup, sm));
        if (!L.includes(rightGroup)) setL((prev) => [...prev, rightGroup]); // 大分類もON
      } else {
        for (const sm of children) next.delete(enc(rightGroup, sm));
      }
      return next;
    });
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
              {JOB_LARGE.map((lg) => {
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

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200">
          <button
            onClick={() => {
              setL([]);
              setSKeys(new Set());
            }}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            クリア
          </button>
          <button
            onClick={() => onApplyAction(L, Array.from(SKeys))}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            適用して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
