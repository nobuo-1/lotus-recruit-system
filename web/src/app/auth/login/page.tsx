"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const onLogin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMsg("ログイン中…");

    try {
      // ★ email/password をそのままサーバへ。Cookie はサーバが発行
      const res = await fetch("/auth/login", {
        method: "POST",
        credentials: "include", // Set-Cookie を確実に反映
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(`エラー: ${j?.error ?? `HTTP ${res.status}`}`);
        setBusy(false);
        return;
      }

      setMsg("ログインに成功しました。ダッシュボードへ移動します…");
      router.replace("/dashboard");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg(`エラー: ${m}`); // ここに出ていた "Failed to fetch" も表示されます
    } finally {
      setBusy(false);
    }
  }, [busy, email, password, router]);

  const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") onLogin();
  };

  // 共通っぽいシンプルなヘッダー（★「メール用設定」ボタンは削除）
  const Header = () => (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2"
          aria-label="ダッシュボードへ"
        >
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
      </div>
    </header>
  );

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mx-auto max-w-md">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-neutral-900">
              ログイン
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              アカウントのメールアドレスとパスワードを入力してください。
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 p-4">
            <label className="mb-1 block text-sm text-neutral-600">
              メール
            </label>
            <input
              className="mb-3 w-full rounded-lg border border-neutral-300 p-2 outline-none focus:ring-2 focus:ring-neutral-300"
              placeholder="you@example.com"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={onKeyDown}
            />

            <label className="mb-1 block text-sm text-neutral-600">
              パスワード
            </label>
            <input
              className="mb-4 w-full rounded-lg border border-neutral-300 p-2 outline-none focus:ring-2 focus:ring-neutral-300"
              placeholder="Your password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
            />

            <button
              className="w-full rounded-xl border border-neutral-200 bg-neutral-900 px-4 py-2 text-white hover:opacity-90 disabled:opacity-60"
              onClick={onLogin}
              disabled={busy}
            >
              {busy ? "ログイン中…" : "ログイン"}
            </button>

            {msg && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-500">
                {msg}
              </p>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-neutral-400">
            このサイトは reCAPTCHA 等によって保護されている場合があります。
          </p>
        </div>
      </main>
    </>
  );
}
