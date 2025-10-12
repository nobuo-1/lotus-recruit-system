"use client";
import React from "react";

/* ====== 低レベルAPI（発火・購読） ====== */
export type ToastKind = "success" | "error" | "info";
export type ToastItem = { id: number; text: string; kind: ToastKind };

let seq = 1;
const listeners = new Set<(t: ToastItem) => void>();

/** 購読：クリーンアップは void を返す関数にする（←ここが型エラー回避ポイント） */
export function onToast(fn: (t: ToastItem) => void) {
  listeners.add(fn);
  return () => {
    // boolean を返さないようにする
    listeners.delete(fn);
  };
}

function emit(t: ToastItem) {
  listeners.forEach((l) => l(t));
}

/* ====== 公開トースト関数 ====== */
export function toast(text: string, kind: ToastKind = "info") {
  emit({ id: seq++, text, kind });
}
export const toastSuccess = (t: string) => toast(t, "success");
export const toastError = (t: string) => toast(t, "error");
export const toastInfo = (t: string) => toast(t, "info");

/* ====== 画面に出すビュー ====== */
export function AppToastViewport() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    const off = onToast((t) => {
      setItems((prev) => [t, ...prev].slice(0, 3));
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 2200);
    });
    // クリーンアップは void を返す
    return () => {
      off();
    };
  }, []);

  const border = (k: ToastKind) =>
    k === "success"
      ? "border-emerald-300"
      : k === "error"
      ? "border-rose-300"
      : "border-neutral-200";

  return (
    <div
      aria-live="polite"
      className="fixed inset-x-0 top-4 z-[1000] flex justify-center px-4 pointer-events-none"
    >
      <div className="flex w-full max-w-md flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm ${border(
              t.kind
            )}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
