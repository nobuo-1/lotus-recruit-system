// web/src/server/formOutreachFormSender.ts

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

/** フォーム送信のデバッグ用情報 */
export type FormDebugInfo = {
  canAccessForm?: boolean | null;
  hasCaptcha?: boolean | null;
  inputTotal?: number | null;
  inputFilled?: number | null;
  selectTotal?: number | null;
  selectFilled?: number | null;
  checkboxTotal?: number | null;
  checkboxFilled?: number | null;
  hasActionButton?: boolean | null;
  clickedConfirm?: boolean | null;
  clickedSubmit?: boolean | null;
  sentStatus?: "success" | "failure" | "unknown" | "error" | string;
};

/** reCAPTCHA / hCaptcha を検出する（自動送信不可にするため） */
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

/** route.ts からも使えるように export */
export function detectCaptchaFromHtml(html: string): boolean {
  return hasCaptcha(html);
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

/** OpenAI に投げてフォームプランをもらう共通ロジック */
async function callOpenAiForPlan(
  payload: FormSenderContext,
  htmlForModel: string
): Promise<FormPlan | null> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const userPayload = {
    targetUrl: payload.targetUrl,
    html: htmlForModel,
    message: payload.message,
    sender: payload.sender,
    recipient: payload.recipient,
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

/**
 * OpenAI に HTML + 文脈を渡して「どのフィールドに何を入れるか」のプランを作らせる
 * - ctx.html が SSR などの素の HTML 用（SPA は別途レンダリング済みHTMLを渡すのが望ましい）
 * - reCAPTCHA / hCaptcha があるページは null を返して自動送信不可にする
 */
export async function planFormSubmission(
  ctx: FormSenderContext
): Promise<FormPlan | null> {
  // HTML が長すぎるとトークンが厳しいので先頭だけを渡す
  const htmlSnippet =
    ctx.html.length > 20000 ? ctx.html.slice(0, 20000) : ctx.html;

  // reCAPTCHA / hCaptcha があれば、この時点で自動送信不可として null を返す
  if (hasCaptcha(htmlSnippet)) {
    console.log("[form-plan] captcha detected, skip auto submission:", {
      url: ctx.targetUrl,
    });
    return null;
  }

  return callOpenAiForPlan(ctx, htmlSnippet);
}

/**
 * 実際にフォーム送信を Playwright で行う
 * - targetUrl へアクセス
 * - plan.fields の name に対応する input/textarea/select に値を入力
 * - フォーム内の「確認」「送信」ボタンを順にクリック
 * - 最終的なページの HTML を返す
 *
 * @param targetUrl フォームページのURL（元ページ）
 * @param plan OpenAI が生成した送信プラン
 * @param _cookieHeader 互換用（現在は未使用）
 *
 * ※ 戻り値に debug を含めて、route.ts から UI デバッグに使えるようにしています
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
  debug?: FormDebugInfo;
}> {
  // Playwright を動的 import（型エラー回避 & serverless 対応のため）
  const pw = await import("playwright");
  const chromium = (pw as any).chromium as typeof import("playwright").chromium;

  const browser = await chromium.launch({ headless: true });
  let page: any = null;

  // デバッグ用
  const debug: FormDebugInfo = {
    canAccessForm: null,
    hasCaptcha: null,
    inputTotal: null,
    inputFilled: null,
    selectTotal: null,
    selectFilled: null,
    checkboxTotal: null,
    checkboxFilled: null,
    hasActionButton: null,
    clickedConfirm: null,
    clickedSubmit: null,
    sentStatus: "unknown",
  };

  try {
    page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) LotusRecruitBot/1.0 Chrome/120.0.0.0 Safari/537.36",
    });

    console.log("[form-submit] goto", targetUrl);
    const resp = await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    debug.canAccessForm = !!resp && resp.status() < 400;

    // ひとまず、JS 実行後の HTML から CAPTCHA もチェック
    const currentHtml = await page.content();
    debug.hasCaptcha = detectCaptchaFromHtml(currentHtml);

    // === 1. 対象フォームを特定 ===
    const fieldEntries = Object.entries(plan.fields || {});
    let formLocator = page.locator("form");

    const formCount = await formLocator.count();
    if (!formCount) {
      console.log("[form-submit] no form found on page");
      debug.inputTotal = 0;
      debug.selectTotal = 0;
      debug.checkboxTotal = 0;
      debug.sentStatus = "error";

      return {
        ok: false,
        status: resp?.status() ?? 0,
        url: page.url(),
        html: currentHtml,
        debug,
      };
    }

    // plan.fields の name が一番多く含まれている form を採用
    if (fieldEntries.length > 0 && formCount > 1) {
      const names = fieldEntries.map(([name]) => name);
      let bestIndex = 0;
      let bestScore = -1;

      for (let i = 0; i < formCount; i++) {
        const loc = formLocator.nth(i);
        const score = await loc.evaluate((form: any, fieldNames: string[]) => {
          const inputs = Array.from(
            form.querySelectorAll("input, textarea, select")
          ) as HTMLInputElement[];
          let count = 0;
          for (const el of inputs) {
            const n = (el.getAttribute("name") || "").trim();
            if (n && fieldNames.includes(n)) count++;
          }
          return count;
        }, names);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      formLocator = formLocator.nth(bestIndex);
    } else {
      // 単一フォームならそのまま
      formLocator = formLocator.first();
    }

    if (!(await formLocator.count())) {
      console.log("[form-submit] resolved form not found");
      debug.inputTotal = 0;
      debug.selectTotal = 0;
      debug.checkboxTotal = 0;
      debug.sentStatus = "error";

      return {
        ok: false,
        status: resp?.status() ?? 0,
        url: page.url(),
        html: currentHtml,
        debug,
      };
    }

    // data 属性でマーキング
    await formLocator.evaluate((f: any) => {
      f.setAttribute("data-lotus-target-form", "1");
    });

    // === 2. フォーム内のフィールド総数を集計 ===
    const totals = await page.evaluate(() => {
      const formEl =
        (document.querySelector(
          'form[data-lotus-target-form="1"]'
        ) as HTMLFormElement | null) ||
        (document.querySelector("form") as HTMLFormElement | null);

      if (!formEl) {
        return {
          inputTotal: 0,
          selectTotal: 0,
          checkboxTotal: 0,
        };
      }

      const inputs = Array.from(
        formEl.querySelectorAll("input")
      ) as HTMLInputElement[];
      const textareas = Array.from(
        formEl.querySelectorAll("textarea")
      ) as HTMLTextAreaElement[];
      const selects = Array.from(
        formEl.querySelectorAll("select")
      ) as HTMLSelectElement[];

      const normalInputs = inputs.filter((el) => {
        const t = (el.type || "").toLowerCase();
        return !["hidden", "submit", "button", "image", "reset"].includes(t);
      });
      const checkboxInputs = inputs.filter(
        (el) => (el.type || "").toLowerCase() === "checkbox"
      );

      return {
        inputTotal: normalInputs.length + textareas.length,
        selectTotal: selects.length,
        checkboxTotal: checkboxInputs.length,
      };
    });

    debug.inputTotal = totals.inputTotal;
    debug.selectTotal = totals.selectTotal;
    debug.checkboxTotal = totals.checkboxTotal;

    // === 3. フィールド入力 ===
    let firstFieldSelector: string | null = null;
    let inputFilled = 0;
    let selectFilled = 0;
    let checkboxFilled = 0;

    for (const [name, value] of fieldEntries) {
      const selector = `form[data-lotus-target-form="1"] input[name="${name}"], form[data-lotus-target-form="1"] textarea[name="${name}"], form[data-lotus-target-form="1"] select[name="${name}"]`;
      const locator = page.locator(selector).first();
      const count = await locator.count();
      if (!count) {
        console.log("[form-submit] field not found:", name);
        continue;
      }
      if (!firstFieldSelector) firstFieldSelector = selector;

      const tagName = await locator.evaluate((node: any) =>
        String(node.tagName || "").toLowerCase()
      );
      const typeAttr = await locator.getAttribute("type");
      const type = String(typeAttr || "").toLowerCase();

      if (tagName === "select") {
        let selected = false;
        try {
          await locator.selectOption({ value: value });
          selected = true;
        } catch {
          await locator.selectOption({ label: value }).catch(() => {});
        }
        if (selected) selectFilled++;
        continue;
      }

      if (tagName === "input" && (type === "checkbox" || type === "radio")) {
        if (value && value !== "0" && value.toLowerCase() !== "false") {
          await locator.check().catch(() => {});
          checkboxFilled++;
        } else {
          await locator.uncheck().catch(() => {});
        }
        continue;
      }

      // その他の input / textarea は単純に文字列として入力
      await locator.fill(value ?? "").catch(() => {});
      if (value && value.trim().length > 0) {
        inputFilled++;
      }
    }

    debug.inputFilled = inputFilled;
    debug.selectFilled = selectFilled;
    debug.checkboxFilled = checkboxFilled;

    // === 4. ボタンの有無を確認 ===
    const hasActionButton = await page.evaluate(() => {
      const formEl =
        (document.querySelector(
          'form[data-lotus-target-form="1"]'
        ) as HTMLFormElement | null) ||
        (document.querySelector("form") as HTMLFormElement | null);
      if (!formEl) return false;

      const btns = Array.from(
        formEl.querySelectorAll(
          'button, input[type="submit"], input[type="button"], input[type="image"]'
        )
      ) as (HTMLButtonElement | HTMLInputElement)[];

      return btns.length > 0;
    });
    debug.hasActionButton = hasActionButton;

    // === 5. 送信ボタンをクリック ===
    async function clickOnce(
      preferConfirmFirst: boolean
    ): Promise<"confirm" | "submit" | null> {
      const candidates = page.locator(
        'form[data-lotus-target-form="1"] button, ' +
          'form[data-lotus-target-form="1"] input[type="submit"], ' +
          'form[data-lotus-target-form="1"] input[type="button"], ' +
          'form[data-lotus-target-form="1"] input[type="image"]'
      );

      const count = await candidates.count();
      if (!count) return null;

      type Cand = {
        idx: number;
        label: string;
        priority: number;
        kind: "confirm" | "submit" | "other";
      };
      const list: Cand[] = [];

      for (let i = 0; i < count; i++) {
        const el = candidates.nth(i);
        const text = (await el.innerText().catch(() => "")) || "";
        const valueAttr = (await el.getAttribute("value")) || "";
        const label = (text || valueAttr).trim();
        if (!label) continue;

        const isConfirm = /確認/.test(label);
        const isSend = /送信|送信する|送信します|送信完了/.test(label);

        let kind: Cand["kind"] = "other";
        if (isConfirm) kind = "confirm";
        else if (isSend) kind = "submit";

        let priority = 99;
        if (preferConfirmFirst) {
          if (kind === "confirm") priority = 1;
          else if (kind === "submit") priority = 2;
        } else {
          if (kind === "submit") priority = 1;
          else if (kind === "confirm") priority = 2;
        }

        if (priority === 99 && kind === "other") continue;

        list.push({ idx: i, label, priority, kind });
      }

      if (!list.length) return null;
      list.sort((a, b) => a.priority - b.priority);
      const target = candidates.nth(list[0].idx);
      console.log("[form-submit] click button:", list[0].label);

      await Promise.all([
        target.click().catch(() => {}),
        page
          .waitForLoadState("networkidle", { timeout: 15000 })
          .catch(() => {}),
      ]);
      await page.waitForTimeout(800).catch(() => {});

      return list[0].kind === "confirm" || list[0].kind === "submit"
        ? list[0].kind
        : null;
    }

    // 1回目: 「確認」ボタン優先（確認画面へ）
    const firstClick = await clickOnce(true);
    if (firstClick === "confirm") debug.clickedConfirm = true;
    if (firstClick === "submit") debug.clickedSubmit = true;

    // 2回目: 「送信」ボタン優先（確定送信）
    const secondClick = await clickOnce(false);
    if (secondClick === "submit") debug.clickedSubmit = true;

    const html = await page.content();
    const url = page.url();

    // 実際の送信成否は judgeFormSubmissionResult 側で判定するのでここでは unknown
    debug.sentStatus = "unknown";

    return {
      ok: true,
      status: resp?.status() ?? 200,
      url,
      html,
      debug,
    };
  } catch (e) {
    console.error("[form-submit] error", e);
    debug.sentStatus = "error";

    if (page) {
      try {
        const html = await page.content();
        const currentUrl = page.url();
        return {
          ok: false,
          status: 0,
          url: currentUrl,
          html,
          debug,
        };
      } catch {
        // ignore
      }
    }

    return {
      ok: false,
      status: 0,
      url: targetUrl,
      html: "",
      debug,
    };
  } finally {
    await browser.close();
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
