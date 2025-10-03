"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const onLogin = async () => {
    setMsg("ログイン中…");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        console.error("[login:error]", error);
        setMsg(`エラー: ${error.message}`);
        return;
      }

      const session = data.session;
      if (!session?.access_token || !session?.refresh_token) {
        setMsg("エラー: セッション取得に失敗しました。");
        return;
      }

      // ⚠ ここが重要：/api ではなく /auth/set に POST する
      const res = await fetch("/auth/set", {
        method: "POST",
        credentials: "include", // Set-Cookie を確実に受け取る
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.error("[auth/set:error]", j);
        setMsg(`エラー: サーバCookie設定に失敗 (${res.status})`);
        return;
      }

      setMsg("OK! ダッシュボードへ移動します。");
      location.assign("/dashboard");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
      console.error("[login:exception]", e);
      setMsg(`例外: ${msg}`);
    }
  };

  return (
    <main className="max-w-sm mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">ログイン</h1>
      <input
        className="border p-2 w-full mb-2"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="border p-2 w-full mb-2"
        placeholder="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="bg-black text-white p-2 w-full" onClick={onLogin}>
        ログイン
      </button>
      <p className="text-sm text-gray-500 mt-2">{msg}</p>
    </main>
  );
}
