import React from "react";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  className?: string; // 追加：外側ラッパーのスタイルを上書き可能に
};

export default function KpiCard({ label, value, hint, className }: Props) {
  const base =
    "relative overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,251,0.94))] p-5 shadow-[0_12px_34px_rgba(15,23,42,0.05)]";

  return (
    <div className={`${base} ${className ?? ""}`.trim()}>
      <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(226,232,240,0.6),transparent_68%)]" />
      <div className="relative text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </div>
      <div className="relative mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
        {value}
      </div>
      {hint && (
        <div className="relative mt-2 text-xs leading-5 text-neutral-500">
          {hint}
        </div>
      )}
    </div>
  );
}
