"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SupabaseClient の型を軽量化して、TS の「型が深すぎる」エラーを回避する。
 * - 第2型引数はスキーマ名なので "public" 固定で十分
 * - 第1, 第3は never にして“何でも可”の最小表現にする
 */
type SC = SupabaseClient<never, "public", never>;

/** SSR/ビルド時に実体化しないための no-op クライアント（呼ぶと例外にする） */
function createNoopClient(): SC {
  const proxy = new Proxy(
    {},
    {
      get() {
        throw new Error(
          "[supabaseClient] Supabase client is not available on the server/prerender phase."
        );
      },
    }
  );
  return proxy as unknown as SC;
}

/** 実体のシングルトン */
let browserClient: SC | null = null;

/** 実体を必要になった時だけ作る（ブラウザ以外は no-op を返す） */
function ensureClient(): SC {
  if (typeof window === "undefined") {
    // SSG/SSR/ビルド時はこちら（env が未注入でも安全）
    return createNoopClient();
  }
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

    if (!url || !anon) {
      console.warn(
        "[supabaseClient] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。no-op クライアントを返します。"
      );
      return createNoopClient();
    }

    // @supabase/ssr のクライアントはブラウザ用。重いジェネリクスは明示キャストで遮断。
    browserClient = createBrowserClient(url, anon) as unknown as SC;
  }
  return browserClient;
}

/**
 * 既存コード互換のエクスポート。
 * - モジュール評価時に即生成しない（ensureClient 経由）
 * - これにより Vercel の静的生成工程でも安全
 */
export const supabase: SC = ensureClient();

/** 必要に応じて関数版も使えます */
export function getSupabase(): SC {
  return ensureClient();
}
