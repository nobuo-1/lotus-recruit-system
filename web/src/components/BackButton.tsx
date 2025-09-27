"use client";
import React from "react";
import { useRouter } from "next/navigation";

export default function BackButton({
  fallback = "/dashboard",
}: {
  fallback?: string;
}) {
  const router = useRouter();
  const onClick = () => {
    // 履歴が無い時はダッシュボードへ
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  };
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
      aria-label="前のページに戻る"
    >
      戻る
    </button>
  );
}
