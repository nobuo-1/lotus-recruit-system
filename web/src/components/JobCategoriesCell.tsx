// web/src/components/JobCategoriesCell.tsx
"use client";

type JobObj = { large?: unknown; small?: unknown };

/** どんな値でも安全に文字列化（.trim()対象は string のみ） */
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function JobCategoriesCell({
  items,
}: {
  /** 文字列 or {large, small} の配列を想定 */
  items: Array<string | JobObj> | null | undefined;
}) {
  const arr = Array.isArray(items) ? items : [];

  // 文字列の配列へ正規化
  const texts = arr
    .map((it) => {
      if (typeof it === "string") return s(it);
      if (it && typeof it === "object") {
        const L = s((it as JobObj).large);
        const S = s((it as JobObj).small);
        return L && S ? `${L}（${S}）` : L || S || "";
      }
      return "";
    })
    .filter((t) => t.length > 0);

  if (texts.length === 0) return <span className="text-gray-400">-</span>;

  // ボタン風ではなく、中央揃えで縦に羅列
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      {texts.map((t, i) => (
        <span key={i}>{t}</span>
      ))}
    </div>
  );
}
