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
    return null;
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

/**
 * 実際にフォーム送信を Playwright で行う
 * - targetUrl へアクセス
 * - plan.fields の name に対応する input/textarea/select に値を入力
 * - フォーム内の「送信」ボタンを特定してクリック
 * - 遷移 or DOM 変化後の HTML を返す
 *
 * @param targetUrl フォームページのURL（元ページ）
 * @param plan OpenAI が生成した送信プラン
 * @param _cookieHeader 互換用（現在は未使用）
 */
export async function submitFormPlan(
  targetUrl: string,
  plan: FormPlan,
  _cookieHeader?: string
): Promise<{ ok: boolean; status: number; url: string; html: string }> {
  // Playwright を動的 import（serverless / バンドルエラー回避）
  const pw = await import("playwright");
  const chromium = (pw as any).chromium as typeof import("playwright").chromium;

  const browser = await chromium.launch({ headless: true });
  let page: import("playwright").Page | null = null;

  try {
    page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) LotusRecruitBot/1.0 Chrome/120.0.0.0 Safari/537.36",
    });

    console.log("[form-submit] goto", targetUrl);
    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // === 1. フィールド入力 ===
    const fieldEntries = Object.entries(plan.fields || {});
    let firstFieldSelector: string | null = null;

    for (const [name, value] of fieldEntries) {
      const selector = `input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`;
      const el = await page.$(selector);
      if (!el) {
        console.log("[form-submit] field not found:", name);
        continue;
      }
      if (!firstFieldSelector) firstFieldSelector = selector;

      const tagName = await el.evaluate((node) => node.tagName.toLowerCase());
      const typeAttr = await el.evaluate(
        (node: any) => (node.getAttribute && node.getAttribute("type")) || ""
      );
      const type = String(typeAttr || "").toLowerCase();

      if (tagName === "select") {
        try {
          await el.selectOption({ value: value });
        } catch {
          // value で選択できない場合は label マッチも試す
          await el.selectOption({ label: value });
        }
        continue;
      }

      if (tagName === "input" && (type === "checkbox" || type === "radio")) {
        // チェック系は、value が空でなければ true とみなしてチェック
        if (value && value !== "0" && value.toLowerCase() !== "false") {
          await el.check().catch(() => {});
        } else {
          await el.uncheck().catch(() => {});
        }
        continue;
      }

      // その他の input / textarea は単純に文字列として入力
      await el.fill(value ?? "").catch(() => {});
    }

    // === 2. 対象フォームの submit ボタンを探してクリック ===

    // まず、最初に見つかったフィールドが属する form を探す
    let formHandle: import("playwright").ElementHandle<Element> | null = null;

    if (firstFieldSelector) {
      const fieldHandle = await page.$(firstFieldSelector);
      if (fieldHandle) {
        const jsHandle = await fieldHandle.evaluateHandle((el) =>
          el.closest("form")
        );
        const elHandle = jsHandle.asElement();
        if (elHandle) {
          formHandle = elHandle;
        }
      }
    }

    // fallback: ページ内の最初の form
    if (!formHandle) {
      const forms = await page.$$("form");
      if (forms.length > 0) {
        formHandle = forms[0];
      }
    }

    if (!formHandle) {
      console.log("[form-submit] no form found, cannot submit");
      return {
        ok: false,
        status: 0,
        url: page.url(),
        html: await page.content(),
      };
    }

    // form 内の送信ボタン候補
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("送信")',
      'button:has-text("確認")',
      'button:has-text("送信する")',
      'button:has-text("同意して送信")',
      'input[type="button"]',
    ];

    for (const sel of submitSelectors) {
      const btn = await formHandle.$(sel);
      if (btn) {
        console.log("[form-submit] click submit button selector:", sel);
        const [response] = await Promise.all([
          page
            .waitForNavigation({
              waitUntil: "networkidle",
              timeout: 15000,
            })
            .catch(() => null),
          btn.click().catch(() => null),
        ]);

        // SPA など遷移しないケースもあるので、一応少し待ってから HTML を取得
        if (!response) {
          await page.waitForTimeout(1500).catch(() => {});
        }

        const status = response?.status() ?? 200;
        const html = await page.content();

        return {
          ok: true,
          status,
          url: page.url(),
          html,
        };
      }
    }

    // 送信ボタンが見つからない場合は、form.submit() を直接呼ぶ
    console.log("[form-submit] no submit button, call form.submit()");
    const [response] = await Promise.all([
      page
        .waitForNavigation({
          waitUntil: "networkidle",
          timeout: 15000,
        })
        .catch(() => null),
      formHandle.evaluate((form) => {
        (form as HTMLFormElement).submit();
      }),
    ]);

    if (!response) {
      await page.waitForTimeout(1500).catch(() => {});
    }

    const status = response?.status() ?? 200;
    const html = await page.content();

    return {
      ok: true,
      status,
      url: page.url(),
      html,
    };
  } catch (e) {
    console.error("[form-submit] error", e);
    if (page) {
      try {
        const html = await page.content();
        return {
          ok: false,
          status: 0,
          url: page.url(),
          html,
        };
      } catch {
        // どうしようもない場合
      }
    }
    return {
      ok: false,
      status: 0,
      url: targetUrl,
      html: "",
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
    // API キーが無ければ、曖昧なので unknown とする
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
- 形式:
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
