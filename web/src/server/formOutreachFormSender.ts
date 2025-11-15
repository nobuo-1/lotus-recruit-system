// web/src/server/formOutreachFormSender.ts

// フォーム送信に使うコンテキスト
export type FormSenderContext = {
  targetUrl: string;
  html: string;
  message: string; // メッセージテンプレート本文（問い合わせ内容）
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

// Playwright での送信時に収集するデバッグ情報
export type FormSubmitDebug = {
  // Playwright によるアクセス状況
  canAccessForm: boolean;
  hasCaptcha: boolean;

  // 「実際に入力されたフォーム」の集計（ページ全体）
  inputTotal: number;
  inputFilled: number;
  selectTotal: number;
  selectFilled: number;
  checkboxTotal: number;
  checkboxFilled: number;
  hasActionButton: boolean;
  clickedConfirm: boolean;
  clickedSubmit: boolean;

  // 「HTML 構造として存在するフォーム/要素」の集計（ページ全体）
  htmlFormCount: number;
  htmlInputCount: number;
  htmlTextInputCount: number;
  htmlSelectCount: number;
  htmlCheckboxCount: number;
  htmlTextareaCount: number;
  htmlHasSubmitLikeButton: boolean;
};

/** reCAPTCHA / hCaptcha を検出する */
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

/** OpenAI 用のシステムプロンプト */
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
- ページ上部に会社説明や FAQ があっても、下部の「お問い合わせフォーム」を探して選んでください。

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

/** ページ全体 + すべての同一オリジン iframe からフォーム構造を集計する */
async function collectHtmlStructureStats(
  page: import("playwright").Page,
  debug: FormSubmitDebug
) {
  let htmlFormCount = 0;
  let htmlInputCount = 0;
  let htmlTextInputCount = 0;
  let htmlSelectCount = 0;
  let htmlCheckboxCount = 0;
  let htmlTextareaCount = 0;
  let htmlHasSubmitLikeButton = false;

  const frames = page.frames();

  for (const frame of frames) {
    try {
      const root = frame.locator("body");

      const formLocator = root.locator("form");
      htmlFormCount += await formLocator.count();

      const inputLocator = root.locator("input");
      const thisInputCount = await inputLocator.count();
      htmlInputCount += thisInputCount;

      if (thisInputCount > 0) {
        const textInputCount = await inputLocator
          .filter({
            hasNot: root.locator(
              'input[type="hidden"],input[type="submit"],input[type="button"],input[type="reset"]'
            ),
          })
          .count();
        htmlTextInputCount += textInputCount;

        const checkboxCount = await inputLocator
          .filter({ hasText: "", hasNot: root.locator("") }) // ダミー防止
          .locator('[type="checkbox"]')
          .count()
          .catch(async () => root.locator('input[type="checkbox"]').count());
        htmlCheckboxCount += checkboxCount;
      }

      const selectLocator = root.locator("select");
      htmlSelectCount += await selectLocator.count();

      const textareaLocator = root.locator("textarea");
      htmlTextareaCount += await textareaLocator.count();

      const buttonLocator = root.locator(
        'button, input[type="submit"], input[type="button"], input[type="image"], a[role="button"], a[class*="btn"], a[class*="button"]'
      );
      const buttonCount = await buttonLocator.count();
      if (buttonCount > 0) {
        for (let i = 0; i < buttonCount; i++) {
          const el = buttonLocator.nth(i);
          const text = (await el.innerText().catch(() => "")) || "";
          const valueAttr =
            (await el.getAttribute("value").catch(() => null)) || "";
          const ariaLabel =
            (await el.getAttribute("aria-label").catch(() => null)) || "";
          const label = (text || valueAttr || ariaLabel).trim();
          if (!label) continue;
          if (/送信|確認|submit|confirm/i.test(label)) {
            htmlHasSubmitLikeButton = true;
            break;
          }
        }
      }
    } catch {
      // 同一オリジンでない iframe などは無視
      continue;
    }
  }

  debug.htmlFormCount = htmlFormCount;
  debug.htmlInputCount = htmlInputCount;
  debug.htmlTextInputCount = htmlTextInputCount;
  debug.htmlSelectCount = htmlSelectCount;
  debug.htmlCheckboxCount = htmlCheckboxCount;
  debug.htmlTextareaCount = htmlTextareaCount;
  debug.htmlHasSubmitLikeButton = htmlHasSubmitLikeButton;
}

/** ページ全体から「実際に入力済みのフォーム要素」を集計する */
async function collectFilledStats(
  page: import("playwright").Page,
  debug: FormSubmitDebug
) {
  let inputTotal = 0;
  let inputFilled = 0;
  let selectTotal = 0;
  let selectFilled = 0;
  let checkboxTotal = 0;
  let checkboxFilled = 0;
  let hasActionButton = false;

  const frames = page.frames();

  for (const frame of frames) {
    try {
      const root = frame.locator("body");

      // input + textarea
      const inputAndTextarea = root.locator(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea'
      );
      const thisInputTotal = await inputAndTextarea.count();
      inputTotal += thisInputTotal;

      if (thisInputTotal > 0) {
        const flags = await inputAndTextarea.evaluateAll((elements) => {
          return elements.map((el) => {
            const tag = (el as HTMLElement).tagName.toLowerCase();
            if (tag === "textarea") {
              const v = (el as HTMLTextAreaElement).value || "";
              return v.trim().length > 0;
            }
            const input = el as HTMLInputElement;
            const type = (input.getAttribute("type") || "").toLowerCase();

            if (type === "checkbox" || type === "radio") {
              return input.checked;
            }
            const v = input.value || "";
            return v.trim().length > 0;
          });
        });
        inputFilled += flags.filter(Boolean).length;
      }

      // select
      const selects = root.locator("select");
      const thisSelectTotal = await selects.count();
      selectTotal += thisSelectTotal;
      if (thisSelectTotal > 0) {
        const sFlags = await selects.evaluateAll((elements) => {
          return elements.map((el) => {
            const v = (el as HTMLSelectElement).value || "";
            return v.trim().length > 0;
          });
        });
        selectFilled += sFlags.filter(Boolean).length;
      }

      // checkbox
      const checkboxes = root.locator('input[type="checkbox"]');
      const thisCheckboxTotal = await checkboxes.count();
      checkboxTotal += thisCheckboxTotal;
      if (thisCheckboxTotal > 0) {
        const cFlags = await checkboxes.evaluateAll((elements) => {
          return elements.map(
            (el) => (el as HTMLInputElement).checked === true
          );
        });
        checkboxFilled += cFlags.filter(Boolean).length;
      }

      // action ボタン
      const buttonLocator = root.locator(
        'button, input[type="submit"], input[type="button"], input[type="image"], a[role="button"], a[class*="btn"], a[class*="button"]'
      );
      const buttonCount = await buttonLocator.count();
      if (buttonCount > 0 && !hasActionButton) {
        for (let i = 0; i < buttonCount; i++) {
          const el = buttonLocator.nth(i);
          const text = (await el.innerText().catch(() => "")) || "";
          const valueAttr =
            (await el.getAttribute("value").catch(() => null)) || "";
          const ariaLabel =
            (await el.getAttribute("aria-label").catch(() => null)) || "";
          const label = (text || valueAttr || ariaLabel).trim();
          if (!label) continue;
          if (/送信|確認|submit|confirm/i.test(label)) {
            hasActionButton = true;
            break;
          }
        }
      }
    } catch {
      continue;
    }
  }

  debug.inputTotal = inputTotal;
  debug.inputFilled = inputFilled;
  debug.selectTotal = selectTotal;
  debug.selectFilled = selectFilled;
  debug.checkboxTotal = checkboxTotal;
  debug.checkboxFilled = checkboxFilled;
  debug.hasActionButton = hasActionButton;
}

/** name 属性を元に、ページ全体 + すべての同一オリジン iframe に入力する */
async function fillFieldsByName(
  page: import("playwright").Page,
  fields: Record<string, string>
) {
  const frames = page.frames();

  for (const [name, raw] of Object.entries(fields || {})) {
    const value = raw ?? "";
    if (!name) continue;

    for (const frame of frames) {
      try {
        const root = frame.locator("body");
        const locator = root.locator(
          `input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`
        );

        const count = await locator.count();
        if (!count) continue;

        const el = locator.first();
        const tagName = await el.evaluate((node: any) =>
          String(node.tagName || "").toLowerCase()
        );
        const typeAttr = await el.evaluate((node: any) =>
          node.getAttribute ? node.getAttribute("type") : null
        );
        const type = String(typeAttr || "").toLowerCase();

        if (tagName === "select") {
          try {
            await el.selectOption({ value });
          } catch {
            await el.selectOption({ label: value }).catch(() => {});
          }
          continue;
        }

        if (tagName === "input" && (type === "checkbox" || type === "radio")) {
          if (value && value !== "0" && value.toLowerCase() !== "false") {
            await el.check().catch(() => {});
          } else {
            await el.uncheck().catch(() => {});
          }
          continue;
        }

        await el.fill(value).catch(() => {});
      } catch {
        continue;
      }
    }
  }
}

/** 「確認」「送信」ボタンを探してクリックする */
async function clickConfirmAndSubmit(
  page: import("playwright").Page
): Promise<{ clickedConfirm: boolean; clickedSubmit: boolean }> {
  type ClickResult = {
    clicked: boolean;
    clickedConfirm: boolean;
    clickedSubmit: boolean;
  };

  async function clickOnce(preferConfirmFirst: boolean): Promise<ClickResult> {
    // ページ全体を対象にする（フォームに限定せず、iframe も含める）
    const frames = page.frames();

    let bestCandidate: {
      frame: import("playwright").Frame;
      index: number;
      priority: number;
      isConfirm: boolean;
      isSend: boolean;
    } | null = null;

    for (const frame of frames) {
      try {
        const root = frame.locator("body");
        const candidates = root.locator(
          "button, input[type=submit], input[type=button], input[type=image], a[role=button], a[class*='btn'], a[class*='button']"
        );
        const count = await candidates.count();
        if (!count) continue;

        for (let i = 0; i < count; i++) {
          const el = candidates.nth(i);
          const text = (await el.innerText().catch(() => "")) || "";
          const valueAttr =
            (await el.getAttribute("value").catch(() => null)) || "";
          const ariaLabel =
            (await el.getAttribute("aria-label").catch(() => null)) || "";
          const label = (text || valueAttr || ariaLabel).trim();
          if (!label) continue;

          const isConfirm = /確認|confirm/i.test(label);
          const isSend = /送信|submit/i.test(label);
          if (!isConfirm && !isSend) continue;

          let priority = 99;
          if (preferConfirmFirst) {
            if (isConfirm) priority = 1;
            else if (isSend) priority = 2;
          } else {
            if (isSend) priority = 1;
            else if (isConfirm) priority = 2;
          }

          if (!bestCandidate || priority < bestCandidate.priority) {
            bestCandidate = {
              frame,
              index: i,
              priority,
              isConfirm,
              isSend,
            };
          }
        }
      } catch {
        continue;
      }
    }

    if (!bestCandidate) {
      return { clicked: false, clickedConfirm: false, clickedSubmit: false };
    }

    const root = bestCandidate.frame.locator("body");
    const target = root
      .locator(
        "button, input[type=submit], input[type=button], input[type=image], a[role=button], a[class*='btn'], a[class*='button']"
      )
      .nth(bestCandidate.index);

    console.log("[form-submit] click button:", bestCandidate);

    await Promise.all([
      target.click().catch(() => {}),
      page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}),
    ]);
    await page.waitForTimeout(800).catch(() => {});

    return {
      clicked: true,
      clickedConfirm: bestCandidate.isConfirm,
      clickedSubmit: bestCandidate.isSend,
    };
  }

  let clickedConfirmAny = false;
  let clickedSubmitAny = false;

  // 1回目: 確認ボタン優先
  try {
    const r1 = await clickOnce(true);
    if (r1.clicked) {
      if (r1.clickedConfirm) clickedConfirmAny = true;
      if (r1.clickedSubmit) clickedSubmitAny = true;
    }
  } catch {
    // ignore
  }

  // 2回目: 送信ボタン優先
  try {
    const r2 = await clickOnce(false);
    if (r2.clicked) {
      if (r2.clickedConfirm) clickedConfirmAny = true;
      if (r2.clickedSubmit) clickedSubmitAny = true;
    }
  } catch {
    // ignore
  }

  return { clickedConfirm: clickedConfirmAny, clickedSubmit: clickedSubmitAny };
}

/**
 * 実際にフォーム送信を Playwright で行う
 * - targetUrl へアクセス
 * - plan.fields の name に対応する input/textarea/select に値を入力
 * - ページ全体からフォーム構造を集計
 * - フォーム内/ページ内の「確認」「送信」ボタンを順にクリック
 * - 最終的なページの HTML とデバッグ情報を返す
 */
export async function submitFormPlan(
  targetUrl: string,
  plan: FormPlan,
  _cookieHeader?: string
): Promise<{
  ok: boolean;
  status: number;
  url: string;
  html: string;
  debug: FormSubmitDebug;
}> {
  // Playwright を動的 import
  const pw = await import("playwright");
  const chromium = (pw as any).chromium as typeof import("playwright").chromium;

  const debug: FormSubmitDebug = {
    canAccessForm: false,
    hasCaptcha: false,
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
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) LotusRecruitBot/1.0 Chrome/120.0.0.0 Safari/537.36",
      });

      console.log("[form-submit] goto", targetUrl);
      await page.goto(targetUrl, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      debug.canAccessForm = true;

      // 1. HTML 構造としてのフォーム/要素数を集計
      await collectHtmlStructureStats(page, debug);

      // 2. ChatGPT が生成した fields をページ全体に入力
      await fillFieldsByName(page, plan.fields || {});

      // 3. 入力後の「実際に入力済みの要素数」を集計
      await collectFilledStats(page, debug);

      // 4. ボタンをクリック（確認 → 送信）
      const clickResult = await clickConfirmAndSubmit(page);
      debug.clickedConfirm = clickResult.clickedConfirm;
      debug.clickedSubmit = clickResult.clickedSubmit;

      // 5. 送信後の HTML を取得
      const html = await page.content();
      const url = page.url();

      await browser.close();

      return {
        ok: true,
        status: 200,
        url,
        html,
        debug,
      };
    } catch (innerErr) {
      console.error("[form-submit] inner error", innerErr);
      try {
        debug.canAccessForm = debug.canAccessForm || false;
      } catch {
        // ignore
      }
      await browser.close();
      return {
        ok: false,
        status: 0,
        url: targetUrl,
        html: "",
        debug,
      };
    }
  } catch (e) {
    console.error("[form-submit] launch error", e);
    debug.canAccessForm = false;
    return {
      ok: false,
      status: 0,
      url: targetUrl,
      html: "",
      debug,
    };
  }
}

/**
 * ★ 送信はしないで、フォーム構造だけを Playwright で解析するデバッグ専用関数
 * - plan が生成できなかったり、submitFormPlan でエラーになった時用
 */
export async function collectFormDebugOnly(
  targetUrl: string
): Promise<FormSubmitDebug> {
  const pw = await import("playwright");
  const chromium = (pw as any).chromium as typeof import("playwright").chromium;

  const debug: FormSubmitDebug = {
    canAccessForm: false,
    hasCaptcha: false,
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
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
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

      await collectHtmlStructureStats(page, debug);
      await collectFilledStats(page, debug);

      await browser.close();
      return debug;
    } catch (innerErr) {
      console.error("[form-debug-only] inner error", innerErr);
      debug.canAccessForm = debug.canAccessForm || false;
      await browser.close();
      return debug;
    }
  } catch (e) {
    console.error("[form-debug-only] launch error", e);
    debug.canAccessForm = false;
    return debug;
  }
}

/**
 * フォーム送信後のページが「送信成功」かどうかを判定する
 * - まずはキーワードでシステマチックに判定
 * - 微妙な場合だけ OpenAI で JSON 判定
 */
export async function judgeFormSubmissionResult(args: {
  url: string;
  html: string;
}): Promise<"success" | "failure" | "unknown"> {
  const snippet =
    args.html.length > 20000 ? args.html.slice(0, 20000) : args.html;
  const lower = snippet.toLowerCase();

  // 1. システマチックなキーワード判定
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

  // 2. OpenAI による最終判定
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
