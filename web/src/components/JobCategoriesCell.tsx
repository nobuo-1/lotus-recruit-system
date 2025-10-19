// JobCategoriesCell.tsx（新規 or 既存ファイルの下に埋め込みでもOK）
"use client";
import { useState } from "react";

export function JobCategoriesCell({ items }: { items: string[] | null }) {
  const [open, setOpen] = useState(false);
  const arr = items ?? [];
  if (!arr.length) return <span className="text-gray-400">-</span>;

  const shown = open ? arr : arr.slice(0, 2);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map((it, i) => (
        <span key={i} className="px-2 py-0.5 rounded-full border">
          {it}
        </span>
      ))}
      {arr.length > 2 && (
        <button className="text-sm underline" onClick={() => setOpen(!open)}>
          {open ? "閉じる" : `+${arr.length - 2}件`}
        </button>
      )}
    </div>
  );
}
