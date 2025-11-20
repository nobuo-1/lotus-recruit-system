// web/src/features/jobCategories/mynaviJobMapping.ts
// マイナビ側の large_cd / middle_cd / small_cd から
// アプリ側の「固定小分類ID（JobSmallCategory.id）」を求めるヘルパー

import { JOB_CATEGORY_TREE, JobSmallCategory } from "./jobCategoryTree";

export type MynaviJobIds = {
  /** マイナビ大分類 data-large-cd 例: "11" */
  largeCd: string;
  /** マイナビ中分類 data-middle-cd 例: "111" */
  middleCd: string;
  /** マイナビ小分類 value 例: "11105" など（ここではグルーピングにのみ利用） */
  smallCd: string;
};

/**
 * アプリ側で固定している小分類IDを返す
 * - ポリシー：
 *   - 「自社側小分類 ＝ マイナビ中分類」で統一する
 *   - つまり、すべてのマイナビ小分類は “親の middle_cd” に割り振られる
 *
 * @example
 *  // large_cd = "11", middle_cd = "111", small_cd = "11105"
 *  // => return "11-111"
 */
export function resolveInternalSmallCategoryIdFromMynavi(
  ids: MynaviJobIds
): string | null {
  const { largeCd, middleCd } = ids;
  const targetLarge = JOB_CATEGORY_TREE.find((l) => l.id === largeCd);
  if (!targetLarge) return null;

  const internalSmall = targetLarge.smallCategories.find(
    (s) => s.id === `${largeCd}-${middleCd}`
  );

  return internalSmall?.id ?? null;
}

/**
 * （必要であれば）自社側小分類情報を直接取得したい場合のヘルパー
 */
export function findInternalSmallCategory(
  internalSmallId: string
): JobSmallCategory | null {
  for (const large of JOB_CATEGORY_TREE) {
    const found = large.smallCategories.find((s) => s.id === internalSmallId);
    if (found) return found;
  }
  return null;
}
