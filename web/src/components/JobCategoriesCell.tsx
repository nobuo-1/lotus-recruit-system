// web/src/components/JobCategoriesCell.tsx
"use client";

type Pair = { large?: string | null; small?: string | null } | string;

export function JobCategoriesCell({ items }: { items: Pair[] | null }) {
  const labels = (items ?? [])
    .map((it) => {
      if (typeof it === "string") return it;
      const L = (it?.large ?? "").trim();
      const S = (it?.small ?? "").trim();
      if (L && S) return `${L}（${S}）`;
      if (L) return L;
      if (S) return S;
      return "";
    })
    .filter(Boolean);

  if (!labels.length) return <span className="text-gray-400">-</span>;

  // すべて表示（トグルなし）
  return (
    <div className="flex flex-wrap items-center gap-1">
      {labels.map((label, i) => (
        <span key={i} className="px-2 py-0.5 rounded-full border">
          {label}
        </span>
      ))}
    </div>
  );
}
