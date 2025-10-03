"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Settings } from "lucide-react";

/** メール配信トップのトーンに合わせたシンプルなUI */
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
      // 1) Supabase でサインイン
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setMsg(`エラー: ${error.message}`);
        setBusy(false);
        return;
      }

      const session = data.session;
      if (!session?.access_token || !session?.refresh_token) {
        setMsg("エラー: セッション取得に失敗しました。");
        setBusy(false);
        return;
      }

      // 2) サーバ側 Cookie を発行（※ 正しいエンドポイントは /auth/set）
      const res = await fetch("/auth/set", {
        method: "POST",
        credentials: "include", // Set-Cookie を確実に反映させる
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(
          `エラー: サーバCookie設定に失敗しました (${res.status}) ${
            j?.error ? `- ${j.error}` : ""
          }`
        );
        setBusy(false);
        return;
      }

      setMsg("ログインに成功しました。ダッシュボードへ移動します…");
      router.replace("/dashboard");
    } catch (e) {
      // 本番で出ていた "Failed to fetch" はここで拾われます（/api/auth/set → /auth/set で解消）
      const m = e instanceof Error ? e.message : String(e);
      setMsg(`エラー: ${m}`);
    } finally {
      setBusy(false);
    }
  }, [busy, email, password, router]);

  const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") onLogin();
  };

  // --- 共通ヘッダー（/email/page.tsx と同系色のミニマルデザイン） ---
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

        <Link
          href="/email/settings"
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          <Settings className="h-4 w-4 text-neutral-600" strokeWidth={1.6} />
          メール用設定
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
              <p className="mt-3 text-sm text-neutral-500 whitespace-pre-wrap">
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
