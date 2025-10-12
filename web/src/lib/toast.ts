// web/src/lib/toast.ts
export function toastSuccess(message = "保存しました", duration = 2500) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("app:toast", {
        detail: { type: "success", message, duration },
      })
    );
}
export function toastError(message = "エラーが発生しました", duration = 3000) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("app:toast", {
        detail: { type: "error", message, duration },
      })
    );
}
export function toastInfo(message: string, duration = 2500) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("app:toast", {
        detail: { type: "info", message, duration },
      })
    );
}
