"use client";
import React from "react";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import clsx from "clsx";
import { LogOut } from "lucide-react";

export default function LogoutButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onLogout = async () => {
    try {
      setBusy(true);
      await supabase.auth.signOut(); // Cookieもクリア
      location.href = "/auth/login";
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onLogout}
      disabled={busy}
      className={clsx(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50",
        compact && "md:justify-center md:px-2"
      )}
      title="ログアウト"
    >
      <LogOut className="h-4 w-4 shrink-0" />
      <span className={clsx(compact && "md:hidden")}>
        {busy ? "ログアウト中…" : "ログアウト"}
      </span>
    </button>
  );
}
