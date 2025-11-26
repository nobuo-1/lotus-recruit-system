// web/src/server/job-boards/mynaviLogin.ts
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * マイナビ ログインセッション情報
 * - Cookie ヘッダ文字列をそのまま保持
 */
export type MynaviLoginSession = {
  /** 次のリクエストで `headers.cookie` にそのまま入れる用 */
  cookieHeader: string;
};

/**
 * job_board_logins から最新のマイナビ用ログイン情報を取得
 *
 * テーブル構造:
 * - site_key: "mynavi"
 * - username: ログインID
 * - password: パスワード
 */
async function loadMynaviLoginFromDb(): Promise<{
  username: string;
  password: string;
} | null> {
  const sb = await supabaseServer();

  const { data, error } = await sb
    .from("job_board_logins")
    .select("username,password")
    .eq("site_key", "mynavi")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("loadMynaviLoginFromDb error", error);
    return null;
  }
  if (!data?.username || !data?.password) {
    return null;
  }

  return {
    username: data.username,
    password: data.password,
  };
}

/**
 * ログインレスポンスから Cookie ヘッダ文字列を組み立てる
 *
 * - Node の fetch では複数 Set-Cookie をまとめて扱うのが少し面倒なので
 *   raw() があればそれを使い、なければ get("set-cookie") をフォールバックで使う
 */
function buildCookieHeader(res: Response): string {
  const anyHeaders = res.headers as any;

  // undici / node-fetch なら raw() がある場合あり
  const raw = typeof anyHeaders.raw === "function" ? anyHeaders.raw() : null;
  const setCookies: string[] | undefined =
    raw && Array.isArray(raw["set-cookie"]) ? raw["set-cookie"] : undefined;

  if (setCookies && setCookies.length > 0) {
    // `SESSIONID=xxx; Path=/; HttpOnly;...` → `SESSIONID=xxx`
    return setCookies
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
  }

  const single = res.headers.get("set-cookie");
  if (single) {
    return single.split(";")[0].trim();
  }

  return "";
}

/**
 * マイナビにログインし、Cookie ヘッダを返す
 *
 * - reCAPTCHA がサーバーサイドでも必須になっている場合、
 *   この方法だけではログインできない可能性があります。
 * - その場合は、ブラウザでログインしたときの Cookie を
 *   別途環境変数や DB に保存して使う方式に切り替えることになります。
 */
export async function createMynaviLoginSession(): Promise<{
  session: MynaviLoginSession | null;
  debugLogs: string[];
}> {
  const debugLogs: string[] = [];

  const creds = await loadMynaviLoginFromDb();
  if (!creds) {
    debugLogs.push(
      "job_board_logins テーブルからマイナビのログイン情報を取得できませんでした。"
    );
    return { session: null, debugLogs };
  }

  debugLogs.push(
    `DB からマイナビのログインアカウントを取得: ${creds.username}`
  );

  const loginUrl = "https://tenshoku.mynavi.jp/client/menu/index.cfm";

  const form = new URLSearchParams({
    // hidden
    ap_login_chk: "2",
    rc_response: "", // reCAPTCHA のレスポンス（ここでは空のまま）
    OUT_ADMIN_CHECK: "out_admin_check",
    IN_USER_FLG: "1",
    OUT_RET: "cstm_return",
    IN_ADMIN_CHECK: "1",
    IN_REDIRECT_FLG: "1",
    IN_PW_TEMP_CHECK: "0",
    // input
    ap_login_id: creds.username,
    ap_password: creds.password,
    submit: "ログイン",
  });

  let res: Response;
  try {
    res = await fetch(loginUrl, {
      method: "POST",
      redirect: "manual", // ログイン後のリダイレクトは追わず、Set-Cookie だけ取得したい
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        referer: "https://tenshoku.mynavi.jp/client/",
      },
      body: form.toString(),
    });
  } catch (err: any) {
    debugLogs.push(
      `ログインリクエストでエラー: ${String(err?.message || err)}`
    );
    return { session: null, debugLogs };
  }

  debugLogs.push(`login status=${res.status}`);

  const cookieHeader = buildCookieHeader(res);

  if (!cookieHeader) {
    debugLogs.push(
      "Set-Cookie ヘッダが取得できませんでした。ログインに失敗している可能性があります。"
    );
    return { session: null, debugLogs };
  }

  debugLogs.push(`Cookie ヘッダ取得: ${cookieHeader}`);

  return {
    session: {
      cookieHeader,
    },
    debugLogs,
  };
}
