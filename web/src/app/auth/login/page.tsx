// web/src/app/auth/login/page.tsx
"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onLogin() {
    if (loading) return;
    setLoading(true);
    setMsg("ログイン中…");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(`エラー: ${j?.error ?? res.statusText}`);
        setLoading(false);
        return;
      }

      setMsg("OK! ダッシュボードへ移動します。");
      router.push("/dashboard");
    } catch (e) {
      setMsg(`エラー: ${(e as Error).message}`);
      setLoading(false);
    }
  }

  // メール配信トップに寄せたヘッダー（設定ボタンは無し）
  const Header = () => (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="inline-flex items-center gap-2">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            className="text-neutral-800"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M12 2c-.9 2.6-2.9 4.6-5.5 5.5C9.1 8.4 11.1 10.4 12 13c.9-2.6 2.9-4.6 5.5-5.5C14.9 6.6 12.9 4.6 12 2zM5 14c2.9.6 5.3 2.9 5.9 5.9c-.6 2.9-2.9 5.3-5.9 5.9zM19 14c-.6 2.9-2.9 5.3-5.9 5.9c.6-2.9 2.9-5.3 5.9-5.9z"
            />
          </svg>
          <span className="text-sm font-semibold tracking-wide text-neutral-900">
            Lotus Recruit
          </span>
        </Link>

        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back();
            } else {
              router.push("/");
            }
          }}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          戻る
        </button>
      </div>
    </header>
  );

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl p-6">
        <div className="max-w-sm rounded-2xl border border-neutral-200 p-6">
          <h1 className="text-xl font-semibold text-neutral-900">ログイン</h1>
          <p className="mt-1 text-sm text-neutral-500">
            メール配信管理にアクセスするにはサインインしてください。
          </p>

          <div className="mt-4 space-y-2">
            <input
              className="w-full rounded-lg border border-neutral-300 p-2"
              placeholder="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-neutral-300 p-2"
              placeholder="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
              onClick={onLogin}
              disabled={loading}
            >
              ログイン
            </button>
          </div>

          {msg && (
            <p className="mt-3 text-sm text-neutral-500 whitespace-pre-wrap">
              {msg}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
