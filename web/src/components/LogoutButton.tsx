"use client";
import React from "react";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LogoutButton() {
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
      className="px-3 py-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
    >
      {busy ? "ログアウト中…" : "ログアウト"}
    </button>
  );
}
