// web/src/components/Toggle.tsx
import React from "react";
import { clsx } from "clsx";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
};

export default function Toggle({ checked, onChange, disabled, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={clsx(
        "relative inline-flex h-6 w-10 cursor-pointer items-center rounded-full border transition",
        checked
          ? "bg-neutral-700 border-neutral-700"
          : "bg-neutral-300 border-neutral-300",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={clsx(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
