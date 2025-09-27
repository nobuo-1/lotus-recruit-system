import React from "react";
type Props = { label: string; value: string | number; hint?: string };
export default function KpiCard({ label, value, hint }: Props) {
  return (
    <div className="rounded-2xl border border-neutral-200 p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}
