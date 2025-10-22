"use client";
import React from "react";

type Props = {
  action: string; // POST 先（/api/.../cancel）
  idName?: string; // hidden name（デフォルト: "id"）
  idValue: string; // hidden value（予約ID）
  label?: string; // ボタン表示
  className?: string; // 見た目
  confirmText?: string; // 確認文言
};

export default function ConfirmCancelButton({
  action,
  idName = "id",
  idValue,
  label = "予約をキャンセル",
  className = "",
  confirmText = "この予約をキャンセルします。よろしいですか？",
}: Props) {
  return (
    <form
      action={action}
      method="post"
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) {
          e.preventDefault();
        }
      }}
      className="inline-block"
    >
      <input type="hidden" name={idName} value={idValue} />
      <button
        type="submit"
        className={
          className ||
          "rounded-xl border border-red-200 px-3 py-1 text-red-700 hover:bg-red-50 whitespace-nowrap"
        }
        title="この予約をキャンセル"
      >
        {label}
      </button>
    </form>
  );
}
