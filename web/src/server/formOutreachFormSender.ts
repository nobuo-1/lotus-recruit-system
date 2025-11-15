// web/src/server/formOutreachFormSender.ts

import type { Page, Frame, Locator } from "playwright";

// フォーム送信に使うコンテキスト
export type FormSenderContext = {
  targetUrl: string;
  html: string;
  message: string; // ★ メッセージテンプレート本文（問い合わせ内容）
  sender: {
    company?: string | null;
    postal_code?: string | null;
    prefecture?: string | null;
    address?: string | null;
    last_name?: string | null;
    first_name?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
  };
  recipient: {
    company_name?: string | null;
    website?: string | null;
    industry?: string | null;
    prefecture?: string | null;
  };
};

export type FormPlan = {
  method: "GET" | "POST";
  action: string;
  fields: Record<string, string>;
};

// Playwright / HTTP 送信時に収集するデバッグ情報
export type FormSubmitDebug = {
  // 実行時の動き
  canAccessForm: boolean | null;
  hasCaptcha?: boolean | null;

  // 「実際に入力・クリックを試みたフォーム / 送信データ」に対するカウント
  inputTotal: number;
  inputFilled: number;
  selectTotal: number;
  selectFilled: number;
  checkboxTotal: number;
  checkboxFilled: number;
  hasActionButton: boolean;
  clickedConfirm: boolean;
  clickedSubmit: boolean;

  // 「ページ全体（全フレーム）」の生の構造情報
  htmlFormCount: number;
  htmlInputCount: number;
  htmlTextInputCount: number;
  htmlSelectCount: number;
  htmlCheckboxCount: number;
  htmlTextareaCount: number;
  htmlHasSubmitLikeButton: boolean;

  // route.ts 側で上書きされる最終ステータス用（unknown / success / failure / captcha / error など）
  sentStatus?: string;
};

/** reCAPTCHA / hCaptcha を検出する（静的 HTML からのチェック） */
function hasCaptcha(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("g-recaptcha") ||
    lower.includes("grecaptcha") ||
    lower.includes("recaptcha/api.js") ||
    lower.includes("hcaptcha") ||
    lower.includes("data-sitekey")
  );
}

// route.ts からも使えるように export
export function detectCaptchaFromHtml(html: string): boolean {
  const snippet = html.length > 20000 ? html.slice(0, 20000) : html;
  return hasCaptcha(snippet);
}

function buildSystemPrompt(): string {
  return `
あなたは「企業への問い合わせフォーム」を自動入力するアシスタントです。

# 目的
- HTML から問い合わせフォームを特定し、送信者情報・メッセージを使って、実際に送信できるようなフィールド名と値の一覧を作成します。

# 入力データ
- targetUrl: フォームページのURL
- html: フォームを含むHTML
- sender: 送信者の会社名・住所・氏名・メールアドレスなど
- recipient: 相手企業の社名・サイトURL・業種・都道府県など
- message: メッセージテンプレートの本文（問い合わせの本文として使う）

# 必ず守ること
- 出力フォーマットは **必ず JSON** だけにしてください。余計な文章を絶対に含めないでください。
- JSON 形式:
  {
    "method": "GET" または "POST",
    "action": "フォーム送信先URL（空または相対ならそのまま）",
    "fields": {
      "<input name>": "<送信する値>",
      ...
    }
  }

# フォームの選び方
- 問い合わせ・資料請求・お仕事依頼・お問い合わせなど、営業連絡に関係するフォームを 1 つ選んでください。
- <form> タグが複数ある場合は、もっともメインと思われる問い合わせフォームを選ぶこと。

# 入力ルール
- 「必須」や「*」が付いている項目はできるだけすべて埋める。
- type="hidden" も含め、重要そうな hidden フィールドは可能な限り HTML から name / value を読み取り、そのまま fields に含める。
- text, textarea:
  - 問い合わせ内容やご質問の欄には、基本的に **message** をそのまま入力する。
- select, radio, checkbox:
  - ラベルや placeholder を見て、**もっとも自然な選択肢**を選ぶ。
  - 「その他」がある場合、情報がはっきりしないときは「その他」を選ぶ。
- プライバシーポリシーや利用規約の同意チェック:
  - 「同意する」「同意しました」などのチェックを **必ずオン** にする。
  - value が "1" や "on", "yes" などの場合はそれを使用する。
- 確認用入力（メールアドレス再入力など）がある場合:
  - 同じ値をもう一度 fields に含める。

# 名前・住所などの扱い
- 氏名が「姓」「名」に分かれている場合:
  - sender.last_name, sender.first_name を使い分ける。
- 「会社名」は sender.company を使う。
- 「郵便番号」「都道府県」「住所」は sender.postal_code, sender.prefecture, sender.address を使う。

# メールアドレス
- メールアドレス欄には sender.email を設定する。
- 確認欄があれば、同じメールアドレスを設定する。

# 産業・業種など
- 「業種」「業界」には recipient.industry を優先して設定する。

# 出力例
{
  "method": "POST",
  "action": "/contact/confirm",
  "fields": {
    "company": "株式会社LOTUS",
    "last_name": "山田",
    "first_name": "太郎",
    "email": "sales@example.com",
    "email_confirm": "sales@example.com",
    "postal": "123-4567",
    "pref": "大阪府",
    "address": "大阪市北区...",
    "agree_privacy": "1",
    "inquiry": "message の内容をここに入れる",
    "category": "その他"
  }
}
`;
}

/**
 * OpenAI に HTML + 文脈を渡して「どのフィールドに何を入れるか」のプランを作らせる
 * - reCAPTCHA / hCaptcha があるページは null を返して自動送信不可にする
 */
export async function planFormSubmission(
  ctx: FormSenderContext
): Promise<FormPlan | null> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  // HTML が長すぎるとトークンが厳しいので先頭だけを渡す
  const htmlSnippet =
    ctx.html.length > 20000 ? ctx.html.slice(0, 20000) : ctx.html;

  // reCAPTCHA / hCaptcha があれば、この時点で自動送信不可として null を返す
  if (hasCaptcha(htmlSnippet)) {
    console.log("[form-plan] captcha detected, skip auto submission:", {
      url: ctx.targetUrl,
    });
    return null; // route.ts 側で waitlist 行き
  }

  const userPayload = {
    targetUrl: ctx.targetUrl,
    html: htmlSnippet,
    message: ctx.message,
    sender: ctx.sender,
    recipient: ctx.recipient,
  };

  const system = buildSystemPrompt();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: { message?: { content?: string | null } }[];
  };

  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as FormPlan;
    if (
      !parsed ||
      !parsed.action ||
      !parsed.method ||
      typeof parsed.fields !== "object"
    ) {
      return null;
    }
    const methodUpper = parsed.method.toUpperCase() === "GET" ? "GET" : "POST";
    return {
      method: methodUpper,
      action: parsed.action,
      fields: parsed.fields || {},
    };
  } catch {
    return null;
  }
}

/* =========================================================
 * 共通ヘルパー: ページ全体（全フレーム）のフォーム構造をざっくり集計する
 *  （collectFormDebugOnly 用 / 本番送信では不使用）
 * =======================================================*/

async function collectHtmlStructureStats(page: Page): Promise<{
  htmlFormCount: number;
  htmlInputCount: number;
  htmlTextInputCount: number;
  htmlSelectCount: number;
  htmlCheckboxCount: number;
  htmlTextareaCount: number;
  htmlHasSubmitLikeButton: boolean;
}> {
  const frames = page.frames();
  let htmlFormCount = 0;
  let htmlInputCount = 0;
  let htmlTextInputCount = 0;
  let htmlSelectCount = 0;
  let htmlCheckboxCount = 0;
  let htmlTextareaCount = 0;
  let htmlHasSubmitLikeButton = false;

  for (const frame of frames) {
    try {
      const root = frame.locator("body");
      const forms = root.locator("form");
      const fCount = await forms.count();
      htmlFormCount += fCount;

      const inputs = root.locator("input");
      const selects = root.locator("select");
      const textareas = root.locator("textarea");

      htmlInputCount += await inputs.count();
      htmlSelectCount += await selects.count();
      htmlTextareaCount += await textareas.count();

      // text系
      const textInputs = inputs
        .filter({
          hasNot: undefined,
        })
        .locator(
          ':not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])'
        );
      htmlTextInputCount += await textInputs.count();

      // checkbox
      const checkboxes = inputs.locator('[type="checkbox"]');
      htmlCheckboxCount += await checkboxes.count();

      // 送信/確認っぽいボタン
      const buttons = root.locator(
        'button, input[type="submit"], input[type="button"]'
      );
      const bCount = await buttons.count();
      for (let i = 0; i < bCount; i++) {
        const el = buttons.nth(i);
        const text = (await el.innerText().catch(() => "")) || "";
        const valueAttr = (await el.getAttribute("value")) || "";
        const label = (text || valueAttr).trim();
        if (!label) continue;
        if (/送信|確認|submit|confirm/i.test(label)) {
          htmlHasSubmitLikeButton = true;
          break;
        }
      }
      if (htmlHasSubmitLikeButton) break;
    } catch {
      // 1フレームくらい失敗しても無視
      continue;
    }
  }

  return {
    htmlFormCount,
    htmlInputCount,
    htmlTextInputCount,
    htmlSelectCount,
    htmlCheckboxCount,
    htmlTextareaCount,
    htmlHasSubmitLikeButton,
  };
}

/* =========================================================
 * 共通ヘルパー: 「送信対象フォーム」を 1 つ選ぶ（全フレームから）
 *  - 最初に見つかった「入力フィールドを最低1つ以上持つ form」を採用
 *  （collectFormDebugOnly 用）
 * =======================================================*/

async function findTargetForm(
  page: Page
): Promise<{ frame: Frame; form: Locator } | null> {
  const frames = page.frames();

  // 1. frame の出現順に form を探し、最初に「入力欄がある form」を返す
  for (const frame of frames) {
    try {
      const root = frame.locator("body");
      const forms = root.locator("form");
      const formCount = await forms.count();
      for (let i = 0; i < formCount; i++) {
        const form = forms.nth(i);
        const controls = form.locator(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select'
        );
        const cCount = await controls.count();
        if (cCount > 0) {
          return { frame, form };
        }
      }
    } catch {
      continue;
    }
  }

  // 2. form タグがないケース→body 全体を擬似フォームとして扱う
  const mainFrame = page.mainFrame();
  try {
    const root = mainFrame.locator("body");
    const controls = root.locator(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select'
    );
    if ((await controls.count()) > 0) {
      // form がなくても、body を form 相当として扱う
      return { frame: mainFrame, form: root };
    }
  } catch {
    // ignore
  }

  return null;
}

/* =========================================================
 * 共通ヘルパー: 1つのフォーム（Locator）内の「入力済/総数」を集計
 *  （collectFormDebugOnly 用）
 * =======================================================*/

async function collectFilledStatsForForm(formRoot: Locator): Promise<{
  inputTotal: number;
  inputFilled: number;
  selectTotal: number;
  selectFilled: number;
  checkboxTotal: number;
  checkboxFilled: number;
  hasActionButton: boolean;
}> {
  // input / textarea
  const inputLocator = formRoot.locator(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]), textarea'
  );
  const inputTotal = await inputLocator.count();
  const inputFilledFlags = await inputLocator.evaluateAll((elements) => {
    return elements.map((el) => {
      const tag = (el as HTMLElement).tagName.toLowerCase();
      if (tag === "textarea") {
        const v = (el as HTMLTextAreaElement).value || "";
        return v.trim().length > 0;
      }
      const type = (
        (el as HTMLInputElement).getAttribute("type") || ""
      ).toLowerCase();
      if (type === "checkbox" || type === "radio") {
        return (el as HTMLInputElement).checked;
      }
      const v = (el as HTMLInputElement).value || "";
      return v.trim().length > 0;
    });
  });
  const inputFilled = inputFilledFlags.filter(Boolean).length;

  // select
  const selectLocator = formRoot.locator("select");
  const selectTotal = await selectLocator.count();
  const selectFilledFlags = await selectLocator.evaluateAll((elements) => {
    return elements.map((el) => {
      const v = (el as HTMLSelectElement).value || "";
      return v.trim().length > 0;
    });
  });
  const selectFilled = selectFilledFlags.filter(Boolean).length;

  // checkbox
  const checkboxLocator = formRoot.locator('input[type="checkbox"]');
  const checkboxTotal = await checkboxLocator.count();
  const checkboxFilledFlags = await checkboxLocator.evaluateAll((elements) => {
    return elements.map((el) => (el as HTMLInputElement).checked === true);
  });
  const checkboxFilled = checkboxFilledFlags.filter(Boolean).length;

  // action ボタン有無
  const buttonLocator = formRoot.locator(
    'button, input[type="submit"], input[type="button"]'
  );
  const buttonCount = await buttonLocator.count();
  let hasActionButton = false;
  for (let i = 0; i < buttonCount; i++) {
    const el = buttonLocator.nth(i);
    const text = (await el.innerText().catch(() => "")) || "";
    const valueAttr = (await el.getAttribute("value")) || "";
    const label = (text || valueAttr).trim();
    if (!label) continue;
    if (/送信|確認|submit|confirm/i.test(label)) {
      hasActionButton = true;
      break;
    }
  }

  return {
    inputTotal,
    inputFilled,
    selectTotal,
    selectFilled,
    checkboxTotal,
    checkboxFilled,
    hasActionButton,
  };
}

/* =========================================================
 * 実際にフォーム送信を行う（Playwright は使わず HTTP 直送信）
 *  - plan.method / plan.action / plan.fields をそのまま使って
 *    application/x-www-form-urlencoded で POST する
 *  - もしくは GET の場合はクエリ文字列として付与して叩く
 * =======================================================*/

export async function submitFormPlan(
  targetUrl: string,
  plan: FormPlan | null,
  cookieHeader?: string
): Promise<{
  ok: boolean;
  status: number;
  url: string;
  html: string;
  debug: FormSubmitDebug;
}> {
  // デバッグ用の初期値
  const debug: FormSubmitDebug = {
    canAccessForm: true, // ここに来ている時点でフォームページにはアクセス済み
    hasCaptcha: false,
    inputTotal: 0,
    inputFilled: 0,
    selectTotal: 0,
    selectFilled: 0,
    checkboxTotal: 0,
    checkboxFilled: 0,
    hasActionButton: true,
    clickedConfirm: false,
    clickedSubmit: false,
    htmlFormCount: 0,
    htmlInputCount: 0,
    htmlTextInputCount: 0,
    htmlSelectCount: 0,
    htmlCheckboxCount: 0,
    htmlTextareaCount: 0,
    htmlHasSubmitLikeButton: true,
    sentStatus: undefined,
  };

  // プランが無い（= reCAPTCHA / プラン生成失敗など）場合は即終了
  if (!plan) {
    return {
      ok: false,
      status: 0,
      url: targetUrl,
      html: "",
      debug,
    };
  }

  try {
    const method = plan.method?.toUpperCase() === "GET" ? "GET" : "POST";
    const fields = plan.fields || {};

    // action が相対パスの場合に備えて絶対 URL を作る
    let actionUrl = plan.action || targetUrl;
    try {
      actionUrl = new URL(actionUrl, targetUrl).toString();
    } catch {
      actionUrl = targetUrl;
    }

    // 送信するフィールド数をデバッグに反映
    const fieldEntries = Object.entries(fields);
    debug.inputTotal = fieldEntries.length;
    debug.inputFilled = fieldEntries.length;
    debug.clickedSubmit = true; // HTTP 送信を実行したことを示す

    const commonHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) LotusRecruitBot/1.0 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,en;q=0.8",
      Referer: targetUrl,
    };
    if (cookieHeader) {
      commonHeaders["Cookie"] = cookieHeader;
    }

    let res: Response;

    if (method === "GET") {
      // GET の場合はクエリパラメータとして付与
      const urlObj = new URL(actionUrl);
      for (const [k, v] of fieldEntries) {
        urlObj.searchParams.set(k, v ?? "");
      }
      res = await fetch(urlObj.toString(), {
        method: "GET",
        headers: commonHeaders,
        redirect: "follow",
      });
    } else {
      // POST (application/x-www-form-urlencoded)
      const formParams = new URLSearchParams();
      for (const [k, v] of fieldEntries) {
        formParams.append(k, v ?? "");
      }

      res = await fetch(actionUrl, {
        method: "POST",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formParams.toString(),
        redirect: "follow",
      });
    }

    const html = await res.text().catch(() => "");
    const finalUrl = (res as any).url || actionUrl;

    return {
      ok: res.ok,
      status: res.status,
      url: finalUrl,
      html,
      debug,
    };
  } catch (e) {
    // ここで例外を飲み込んで route.ts 側には絶対 throw しない
    console.error("[form-submit] http submit error", e);
    debug.canAccessForm = debug.canAccessForm ?? false;
    debug.sentStatus = "error";

    return {
      ok: false,
      status: 0,
      url: targetUrl,
      html: "",
      debug,
    };
  }
}

/* =========================================================
 * 送信はせず、フォーム構造だけを Playwright で解析するデバッグ専用関数
 *  - plan が生成できなかったり、submitFormPlan でエラーになった時用
 * =======================================================*/

export async function collectFormDebugOnly(
  targetUrl: string
): Promise<FormSubmitDebug> {
  const pw = await import("playwright");
  const chromium = (pw as any).chromium as typeof import("playwright").chromium;

  const browser = await chromium.launch({ headless: true });
  let page: import("playwright").Page | null = null;

  const debug: FormSubmitDebug = {
    canAccessForm: null,
    inputTotal: 0,
    inputFilled: 0,
    selectTotal: 0,
    selectFilled: 0,
    checkboxTotal: 0,
    checkboxFilled: 0,
    hasActionButton: false,
    clickedConfirm: false,
    clickedSubmit: false,
    htmlFormCount: 0,
    htmlInputCount: 0,
    htmlTextInputCount: 0,
    htmlSelectCount: 0,
    htmlCheckboxCount: 0,
    htmlTextareaCount: 0,
    htmlHasSubmitLikeButton: false,
  };

  try {
    page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) LotusRecruitBot/1.0 Chrome/120.0.0.0 Safari/537.36",
    });

    console.log("[form-debug-only] goto", targetUrl);
    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    debug.canAccessForm = true;

    // ページ全体（全フレーム）の構造
    const htmlStats = await collectHtmlStructureStats(page);
    debug.htmlFormCount = htmlStats.htmlFormCount;
    debug.htmlInputCount = htmlStats.htmlInputCount;
    debug.htmlTextInputCount = htmlStats.htmlTextInputCount;
    debug.htmlSelectCount = htmlStats.htmlSelectCount;
    debug.htmlCheckboxCount = htmlStats.htmlCheckboxCount;
    debug.htmlTextareaCount = htmlStats.htmlTextareaCount;
    debug.htmlHasSubmitLikeButton = htmlStats.htmlHasSubmitLikeButton;

    // 「送信候補フォーム」一つに絞って、その中だけのカウントも取る
    const target = await findTargetForm(page);
    if (target) {
      const filledStats = await collectFilledStatsForForm(target.form);
      debug.inputTotal = filledStats.inputTotal;
      debug.inputFilled = filledStats.inputFilled;
      debug.selectTotal = filledStats.selectTotal;
      debug.selectFilled = filledStats.selectFilled;
      debug.checkboxTotal = filledStats.checkboxTotal;
      debug.checkboxFilled = filledStats.checkboxFilled;
      debug.hasActionButton = filledStats.hasActionButton;
    }

    return debug;
  } catch (e) {
    console.error("[form-debug-only] error", e);
    debug.canAccessForm = debug.canAccessForm ?? false;
    return debug;
  } finally {
    await browser.close();
  }
}

/* =========================================================
 * フォーム送信後のページが「送信成功」かどうかを判定する
 * =======================================================*/

export async function judgeFormSubmissionResult(args: {
  url: string;
  html: string;
}): Promise<"success" | "failure" | "unknown"> {
  const snippet =
    args.html.length > 20000 ? args.html.slice(0, 20000) : args.html;
  const lower = snippet.toLowerCase();

  // ★ 1. システマチックなキーワード判定（AI ではない）
  const successKeywords = [
    "送信が完了しました",
    "送信完了",
    "送信が正常に完了",
    "お問い合わせを受け付けました",
    "お問い合わせを受け付け致しました",
    "ありがとうございました",
    "送信いただきありがとうございました",
    "お申し込みを受け付けました",
  ];
  const errorKeywords = [
    "エラーが発生",
    "エラーが発生しました",
    "必須項目",
    "必須項目が入力されていません",
    "入力内容をご確認ください",
    "正しく入力",
    "もう一度入力してください",
    "戻るボタンをクリック",
    "再度入力",
  ];

  const hasSuccess = successKeywords.some((k) => snippet.includes(k));
  const hasError =
    errorKeywords.some((k) => snippet.includes(k)) || lower.includes("error");

  if (hasSuccess && !hasError) {
    return "success";
  }
  if (hasError && !hasSuccess) {
    return "failure";
  }

  // ★ 2. ここから先は「判断」が必要なケース → OpenAI にだけ任せる
  if (!process.env.OPENAI_API_KEY) {
    return "unknown";
  }

  const systemPrompt = `
あなたは「問い合わせフォーム送信後のページ」が成功か失敗かを判定するロボットです。

# 仕事
- HTML の内容から、このページが「問い合わせ送信が正常に完了したサンクスページ」なのか、
  それとも「エラー・未入力警告・確認画面などでまだ送信されていないページ」なのかを判定します。

# 成功（success）の例
- 「送信が完了しました」「お問い合わせを受け付けました」「ありがとうございました」などが目立つ
- 確認画面ではなく、明らかに「受付完了」ページ
- エラーや未入力の警告が無い

# 失敗（failure）の例
- 「必須項目が入力されていません」「正しく入力してください」「入力内容をご確認ください」
- フォーム入力欄がまだ表示されていて、注意メッセージがある
- エラー画面・システムエラーなど

# 不明（unknown）
- 成功とも失敗とも判断できない場合
- 広告や外部サイトへのリダイレクトなど

# 出力形式
- 必ず JSON だけを返してください（余計な文字は一切禁止）
  {
    "status": "success" または "failure" または "unknown",
    "reason": "簡単な理由（日本語文字列）"
  }
`;

  const user = {
    url: args.url,
    html: snippet,
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(user) },
        ],
      }),
    });

    if (!res.ok) {
      return hasSuccess ? "success" : hasError ? "failure" : "unknown";
    }

    const data = (await res.json()) as {
      choices: { message?: { content?: string | null } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) return "unknown";

    const parsed = JSON.parse(content) as {
      status?: "success" | "failure" | "unknown";
      reason?: string;
    };

    if (parsed.status === "success" || parsed.status === "failure") {
      return parsed.status;
    }
    return "unknown";
  } catch {
    return hasSuccess ? "success" : hasError ? "failure" : "unknown";
  }
}
