"use client";

import React from "react";
import Logo from "./Logo";
import BackButton from "./BackButton";
import { usePathname } from "next/navigation";

export default function AppHeader({
  showBack = "auto",
}: {
  /** true/false を明示指定 or "auto"（/dashboard 以外は自動で表示） */
  showBack?: boolean | "auto";
}) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";
  const shouldShow = showBack === "auto" ? !isDashboard : !!showBack;

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-2">
          {shouldShow && <BackButton />}
        </div>
      </div>
    </header>
  );
}
