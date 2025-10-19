// web/src/components/JobCategoriesCell.tsx
"use client";

type Item = { large?: unknown; small?: unknown };

// どんな値でも安全に文字列へ
const toText = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === "string");
    return typeof s === "string" ? s : "";
  }
  if (v == null) return "";
  try {
    return String(v);
  } catch {
    return "";
  }
};

export function JobCategoriesCell({
  items,
}: {
  items: Item[] | null | undefined;
}) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return <span className="text-gray-400">-</span>;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {arr.map((it, i) => {
        const L = toText(it.large).trim();
        const S = toText(it.small).trim();
        const label = L && S ? `${L}（${S}）` : L || S || "-";
        return (
          <span key={i} className="rounded-full border px-2 py-0.5">
            {label}
          </span>
        );
      })}
    </div>
  );
}
