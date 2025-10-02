"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
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

      // ここでセッションをサーバに同期（Cookie発行）
      const session = data.session;
      if (!session?.access_token || !session?.refresh_token) {
        setMsg("エラー: セッション取得に失敗しました。");
        return;
      }

      const res = await fetch("/api/auth/set", {
        method: "POST",
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
    } catch (e: any) {
      console.error("[login:exception]", e);
      setMsg(`例外: ${e?.message ?? e}`);
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
