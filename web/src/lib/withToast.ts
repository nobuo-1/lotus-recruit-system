// web/src/lib/withToast.ts
"use client";
import { toastSuccess, toastError } from "./toast";

export async function withToast(
  resPromise: Promise<Response>,
  okMsg = "保存しました"
) {
  const res = await resPromise;
  if (res.ok) {
    toastSuccess(okMsg);
  } else {
    const txt = await res.text().catch(() => "");
    toastError(txt || "エラーが発生しました");
  }
  return res;
}
