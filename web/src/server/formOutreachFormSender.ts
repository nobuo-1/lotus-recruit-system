// web/src/server/formOutreachFormSender.ts

// ========== 型定義 ==========

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
  // 自動マッピング用のメタ情報（sender / recipient / message など）
  meta?: {
    company: string;
    fullName: string;
    lastName: string;
    firstName: string;
    email: string;
    phone: string;
    website: string;
    postal: string;
    prefecture: string;
    address: string;
    message: string;
    subject: string;
    recipientCompany: string;
  };
};

// Playwright での送信時に収集するデバッグ情報
export type FormSubmitDebug = {
  canAccessForm: boolean | null;
  hasCaptcha?: boolean | null;

  inputTotal: number | null;
  inputFilled: number | null;
  selectTotal: number | null;
  selectFilled: number | null;
  checkboxTotal: number | null;
  checkboxFilled: number | null;

  hasActionButton: boolean | null;
  clickedConfirm: boolean | null;
  clickedSubmit: boolean | null;

  // HTML 生構造レベルの簡易カウント
  htmlFormCount?: number | null;
  htmlInputCount?: number | null;
  htmlTextInputCount?: number | null;
  htmlSelectCount?: number | null;
  htmlCheckboxCount?: number | null;
  htmlTextareaCount?: number | null;
  htmlHasSubmitLikeButton?: boolean | null;

  // どこでエラーになったかを可視化するための追加情報
  lastErrorStep?: string | null;
  lastErrorMessage?: string | null;
};

// ========== CAPTCHA 検出 ==========

/** reCAPTCHA / hCaptcha を検出する（内部用） */
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

// ========== OpenAI プロンプト ==========

function buildSystemPrompt(): string {
  return `
あなたは「企業への問い合わせフォーム」を自動入力するアシスタントです。

# 目的
- HTML から問い合わせフォームを特定し、送信者情報・メッセージを使って、実際に送信できるようなフィールド名と値の一覧を作成します。

# 入力データ
- targetUrl: フォームページのURL
- html: フォームを含むHTML（先頭 20,000 文字程度）
- sender: 送信者の会社名・住所・氏名・メールアドレスなど
- recipient: 相手企業の社名・サイトURL・業種・都道府県など
- message: メッセージテンプレートの本文（問い合わせの本文として使う）

# 必ず守ること
- 出力フォーマットは **必ず JSON だけ** にしてください。余計な文章を絶対に含めないでください。
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
- <form> タグが複数ある場合は、もっともメインと思われる問い合わせフォームを選びます。
- 単なる検索フォームやログインフォームは選ばないでください。

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

// ========== OpenAI プラン生成 ==========

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
    const parsed = JSON.parse(content) as {
      method?: string;
      action?: string;
      fields?: Record<string, string>;
    };

    if (!parsed || typeof parsed !== "object") return null;

    const methodUpper =
      (parsed.method || "POST").toUpperCase() === "GET" ? "GET" : "POST";

    // action が空でも fallback として targetUrl を使う
    const action =
      typeof parsed.action === "string" && parsed.action.trim().length > 0
        ? parsed.action
        : ctx.targetUrl;

    const fields =
      parsed.fields && typeof parsed.fields === "object" ? parsed.fields : {};

    // sender 情報を meta に詰めて、自動マッピング側で利用する
    const fullName = [ctx.sender.last_name || "", ctx.sender.first_name || ""]
      .filter((v) => v && v.trim().length > 0)
      .join(" ")
      .trim();

    const subjectLine =
      ctx.message.split(/\r?\n/)[0]?.slice(0, 50) || "お問い合わせ";

    const meta: FormPlan["meta"] = {
      company: (ctx.sender.company || "").trim(),
      fullName: fullName || "",
      lastName: (ctx.sender.last_name || "").trim(),
      firstName: (ctx.sender.first_name || "").trim(),
      email: (ctx.sender.email || "").trim(),
      phone: (ctx.sender.phone || "").trim(),
      website: (ctx.sender.website || "").trim(),
      postal: (ctx.sender.postal_code || "").trim(),
      prefecture: (ctx.sender.prefecture || "").trim(),
      address: (ctx.sender.address || "").trim(),
      message: ctx.message,
      subject: subjectLine,
      recipientCompany: (ctx.recipient.company_name || "").trim(),
    };

    return {
      method: methodUpper,
      action,
      fields,
      meta,
    };
  } catch {
    return null;
  }
}

// ========== Playwright 共通ヘルパ ==========

/**
 * ページ＋全 iframe を走査して、もっとも「問い合わせフォームっぽい」フレームを選ぶ
 * ついでに htmlFormCount 系のカウントも debug に詰める
 */
async function choosePrimaryFrameAndCollectHtmlStats(
  page: any,
  debug: FormSubmitDebug
): Promise<any> {
  let frames: any[] = [];
  try {
    frames = page.frames ? page.frames() : [page.mainFrame?.()];
  } catch {
    frames = [page];
  }

  let primaryFrame: any;
  try {
    primaryFrame = page.mainFrame ? page.mainFrame() : page;
  } catch {
    primaryFrame = page;
  }

  let bestScore = -1;

  let totalFormCount = 0;
  let totalInputCount = 0;
  let totalTextInputCount = 0;
  let totalSelectCount = 0;
  let totalCheckboxCount = 0;
  let totalTextareaCount = 0;
  let htmlHasSubmitLikeButton = false;

  for (const frame of frames) {
    if (!frame) continue;
    try {
      const formLocator = frame.locator("form");
      const formCount = await formLocator.count();
      totalFormCount += formCount;

      const inputLocator = frame.locator("input");
      const allInputCount = await inputLocator.count();
      totalInputCount += allInputCount;

      const textInputLocator = frame.locator(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"])'
      );
      const textInputCount = await textInputLocator.count();
      totalTextInputCount += textInputCount;

      const selectLocator = frame.locator("select");
      const selectCount = await selectLocator.count();
      totalSelectCount += selectCount;

      const checkboxLocator = frame.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxLocator.count();
      totalCheckboxCount += checkboxCount;

      const textareaLocator = frame.locator("textarea");
      const textareaCount = await textareaLocator.count();
      totalTextareaCount += textareaCount;

      // submit / confirm ボタンがあるか
      const buttonLocator = frame.locator(
        'button, input[type="submit"], input[type="button"]'
      );
      const buttonCount = await buttonLocator.count();
      let hasSubmitLike = false;
      for (let i = 0; i < buttonCount; i++) {
        const el = buttonLocator.nth(i);
        const text = (await el.innerText().catch(() => "")) || "";
        const valueAttr =
          (await el.getAttribute("value").catch(() => null)) || "";
        const label = (text || valueAttr).trim();
        if (!label) continue;
        if (/送信|確認|submit|confirm|入力内容の確認|送信する/i.test(label)) {
          hasSubmitLike = true;
          break;
        }
      }
      if (hasSubmitLike) htmlHasSubmitLikeButton = true;

      // スコアリング：入力欄の数を基準に「メインのフォームっぽさ」を判断
      const score = textInputCount * 2 + textareaCount * 3 + selectCount;
      if (score > bestScore && (textInputCount > 0 || textareaCount > 0)) {
        bestScore = score;
        primaryFrame = frame;
      }
    } catch {
      // そのフレームは無視
    }
  }

  debug.htmlFormCount = totalFormCount;
  debug.htmlInputCount = totalInputCount;
  debug.htmlTextInputCount = totalTextInputCount;
  debug.htmlSelectCount = totalSelectCount;
  debug.htmlCheckboxCount = totalCheckboxCount;
  debug.htmlTextareaCount = totalTextareaCount;
  debug.htmlHasSubmitLikeButton = htmlHasSubmitLikeButton;

  return primaryFrame || page;
}

/**
 * 指定フレーム内の入力欄・セレクト・チェックボックスの状態をカウントして debug に詰める
 */
async function collectFieldStatsInFrame(
  frame: any,
  debug: FormSubmitDebug
): Promise<void> {
  try {
    const rootLocator = frame.locator("body");

    const inputLocator = rootLocator.locator(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]), textarea'
    );
    const inputTotal = await inputLocator.count();
    const inputFilledFlags = await inputLocator.evaluateAll(
      (elements: any[]) => {
        return elements.map((el) => {
          const tag = (el.tagName || "").toLowerCase();
          if (tag === "textarea") {
            const v = (el.value || "") as string;
            return v.trim().length > 0;
          }
          const type = ((el.getAttribute && el.getAttribute("type")) || "")
            .toString()
            .toLowerCase();
          if (type === "checkbox" || type === "radio") {
            return !!(el as any).checked;
          }
          const v = (el.value || "") as string;
          return v.trim().length > 0;
        });
      }
    );
    const inputFilled = inputFilledFlags.filter(Boolean).length;

    const selectLocator = rootLocator.locator("select");
    const selectTotal = await selectLocator.count();
    const selectFilledFlags = await selectLocator.evaluateAll(
      (elements: any[]) =>
        elements.map((el: any) => {
          const v = (el.value || "") as string;
          return v.trim().length > 0;
        })
    );
    const selectFilled = selectFilledFlags.filter(Boolean).length;

    const checkboxLocator = rootLocator.locator('input[type="checkbox"]');
    const checkboxTotal = await checkboxLocator.count();
    const checkboxFilledFlags = await checkboxLocator.evaluateAll(
      (elements: any[]) => elements.map((el: any) => !!el.checked)
    );
    const checkboxFilled = checkboxFilledFlags.filter(Boolean).length;

    // action ボタン有無
    const buttonLocator = rootLocator.locator(
      'button, input[type="submit"], input[type="button"]'
    );
    const buttonCount = await buttonLocator.count();
    let hasActionButton = false;
    for (let i = 0; i < buttonCount; i++) {
      const el = buttonLocator.nth(i);
      const text = (await el.innerText().catch(() => "")) || "";
      const valueAttr =
        (await el.getAttribute("value").catch(() => null)) || "";
      const label = (text || valueAttr).trim();
      if (!label) continue;
      if (/送信|確認|submit|confirm|入力内容の確認|送信する/i.test(label)) {
        hasActionButton = true;
        break;
      }
    }

    debug.inputTotal = inputTotal;
    debug.inputFilled = inputFilled;
    debug.selectTotal = selectTotal;
    debug.selectFilled = selectFilled;
    debug.checkboxTotal = checkboxTotal;
    debug.checkboxFilled = checkboxFilled;
    debug.hasActionButton = hasActionButton;
  } catch (err: any) {
    console.error("[form-submit] collectFieldStatsInFrame error", err);
    debug.lastErrorStep = debug.lastErrorStep || "collectFieldStatsInFrame";
    debug.lastErrorMessage =
      debug.lastErrorMessage || String(err?.message || err);
  }
}

/**
 * 1 つの locator に対して、タグ/タイプを判定して適切に fill / check する
 */
async function fillLocator(locator: any, value: string): Promise<void> {
  try {
    const tagName = await locator.evaluate((node: any) =>
      String(node.tagName || "").toLowerCase()
    );
    const typeAttr = await locator.evaluate((node: any) =>
      node.getAttribute ? node.getAttribute("type") : ""
    );
    const type = String(typeAttr || "").toLowerCase();

    if (tagName === "select") {
      try {
        await locator.selectOption({ value });
      } catch {
        await locator.selectOption({ label: value }).catch(() => {});
      }
      return;
    }

    if (tagName === "input" && (type === "checkbox" || type === "radio")) {
      if (value && value !== "0" && value.toLowerCase() !== "false") {
        await locator.check().catch(() => {});
      } else {
        await locator.uncheck().catch(() => {});
      }
      return;
    }

    await locator.fill(value ?? "").catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * name 属性ベースで 1 フィールドを埋める（まず primaryFrame 内、その後他フレームを探索）
 */
async function fillFieldByNameInFrames(
  page: any,
  primaryFrame: any,
  name: string,
  value: string
): Promise<boolean> {
  const selector = `input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`;
  let frames: any[] = [];
  try {
    frames = page.frames ? page.frames() : [primaryFrame];
  } catch {
    frames = [primaryFrame];
  }

  // 1. primaryFrame を優先
  try {
    const primaryLocator = primaryFrame.locator(selector).first();
    if ((await primaryLocator.count()) > 0) {
      await fillLocator(primaryLocator, value);
      return true;
    }
  } catch {
    // ignore
  }

  // 2. 他フレームを探索
  for (const frame of frames) {
    if (!frame || frame === primaryFrame) continue;
    try {
      const loc = frame.locator(selector).first();
      if ((await loc.count()) > 0) {
        await fillLocator(loc, value);
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * sender / recipient / message の情報を元に、
 * ラベル / placeholder / name 属性から自動マッピングして値を埋める（iframe 内でも動く）
 */
async function autoFillFieldsInFrame(
  primaryFrame: any,
  meta?: FormPlan["meta"]
) {
  if (!meta) return;

  try {
    await primaryFrame.evaluate((m: any) => {
      const doc = document;

      function getLabelText(el: HTMLElement): string {
        try {
          const id = el.getAttribute("id");
          if (id) {
            const label = doc.querySelector(`label[for="${id}"]`);
            if (label && label.textContent) return label.textContent;
          }
          const parentLabel = el.closest("label");
          if (parentLabel && parentLabel.textContent)
            return parentLabel.textContent;
          const aria = el.getAttribute("aria-label");
          if (aria) return aria;
          const prev = el.previousElementSibling as HTMLElement | null;
          if (prev && prev.textContent) return prev.textContent;
        } catch {
          // ignore
        }
        return "";
      }

      const elements = Array.from(
        doc.querySelectorAll("input, textarea, select")
      ) as HTMLInputElement[];

      for (const el of elements) {
        const tag = (el.tagName || "").toLowerCase();
        const type = (el.getAttribute("type") || "").toLowerCase();
        const nameAttr = (el.getAttribute("name") || "").toLowerCase();
        const placeholder = (
          el.getAttribute("placeholder") || ""
        ).toLowerCase();
        const labelText = getLabelText(el as any).toLowerCase();
        const surrounding = `${labelText} ${placeholder} ${nameAttr}`;

        // ボタン類はスキップ
        if (
          tag === "input" &&
          ["submit", "button", "image", "reset", "file"].includes(type)
        ) {
          continue;
        }

        // 同意系チェックボックス
        if (tag === "input" && type === "checkbox") {
          if (
            /同意|承諾|プライバシー|個人情報|規約/.test(surrounding) &&
            !(el as any).checked
          ) {
            (el as any).checked = true;
            try {
              el.dispatchEvent(new Event("change", { bubbles: true }));
            } catch {
              // ignore
            }
          }
          continue;
        }

        // ラジオボタン → 「問い合わせ」「その他」などを優先してオンにしておく
        if (tag === "input" && type === "radio") {
          if (/お問い合わせ|問い合わせ|資料請求|その他/.test(surrounding)) {
            (el as any).checked = true;
            try {
              el.dispatchEvent(new Event("change", { bubbles: true }));
            } catch {
              // ignore
            }
          }
          continue;
        }

        let valueToSet = "";

        if (/mail|メール/.test(surrounding)) {
          valueToSet = m.email || m.website || m.company;
        } else if (
          /会社|御社|貴社|社名|法人|組織|団体/.test(surrounding) ||
          /company|corp/.test(surrounding)
        ) {
          valueToSet = m.company || m.recipientCompany || "";
        } else if (
          /氏名|お名前|名前|担当者|ご担当/.test(surrounding) ||
          /name/.test(surrounding)
        ) {
          valueToSet =
            m.fullName ||
            (m.lastName && m.firstName
              ? `${m.lastName} ${m.firstName}`
              : m.lastName || m.firstName);
        } else if (
          /郵便番号|〒/.test(surrounding) ||
          /zip|postal/.test(surrounding)
        ) {
          valueToSet = m.postal || "";
        } else if (/都道府県/.test(surrounding)) {
          valueToSet = m.prefecture || "";
        } else if (/住所/.test(surrounding)) {
          valueToSet = m.address || "";
        } else if (
          /電話|tel|携帯|mobile/.test(surrounding) ||
          /tel|phone/.test(surrounding)
        ) {
          valueToSet = m.phone || "";
        } else if (/件名|タイトル|subject/.test(surrounding)) {
          valueToSet = m.subject || "お問い合わせ";
        } else if (
          tag === "textarea" ||
          /内容|お問い合わせ|問合せ|メッセージ|ご質問|詳細|ご用件/.test(
            surrounding
          )
        ) {
          valueToSet = m.message || "";
        }

        if (!valueToSet) continue;

        try {
          (el as any).value = valueToSet;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } catch {
          // ignore
        }
      }
    }, meta);
  } catch (err: any) {
    console.error("[form-submit] autoFillFieldsInFrame error", err);
  }
}

/**
 * 送信/確認ボタンを「確認優先 → 送信優先」で 2 回クリックしてみる
 * primaryFrame 内を優先しつつ、フォームがない場合にも対応
 */
async function clickSubmitButtons(
  page: any,
  primaryFrame: any
): Promise<{ clickedConfirm: boolean; clickedSubmit: boolean }> {
  let clickedConfirmAny = false;
  let clickedSubmitAny = false;

  async function clickOnce(
    frame: any,
    preferConfirmFirst: boolean
  ): Promise<{
    clicked: boolean;
    clickedConfirm: boolean;
    clickedSubmit: boolean;
  }> {
    const base = frame.locator("body");
    const candidates = base.locator(
      "button, input[type=submit], input[type=button]"
    );

    const count = await candidates.count().catch(() => 0);
    if (!count) {
      return { clicked: false, clickedConfirm: false, clickedSubmit: false };
    }

    type Cand = {
      idx: number;
      label: string;
      priority: number;
      isConfirm: boolean;
      isSend: boolean;
    };
    const list: Cand[] = [];

    for (let i = 0; i < count; i++) {
      const el = candidates.nth(i);
      const text = (await el.innerText().catch(() => "")) || "";
      const valueAttr =
        (await el.getAttribute("value").catch(() => null)) || "";
      const label = (text || valueAttr).trim();
      if (!label) continue;

      const isConfirm = /確認|confirm|入力内容の確認/i.test(label);
      const isSend = /送信|submit|送信する/i.test(label);

      let priority = 99;
      if (preferConfirmFirst) {
        if (isConfirm) priority = 1;
        else if (isSend) priority = 2;
      } else {
        if (isSend) priority = 1;
        else if (isConfirm) priority = 2;
      }
      if (priority === 99) continue;

      list.push({ idx: i, label, priority, isConfirm, isSend });
    }

    if (!list.length) {
      return { clicked: false, clickedConfirm: false, clickedSubmit: false };
    }

    list.sort((a, b) => a.priority - b.priority);
    const chosen = list[0];
    const target = candidates.nth(chosen.idx);
    console.log("[form-submit] click button:", chosen.label);

    await Promise.all([
      target.click({ force: true }).catch(() => {}),
      page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}),
    ]);

    await page.waitForTimeout(800).catch(() => {});
    return {
      clicked: true,
      clickedConfirm: chosen.isConfirm,
      clickedSubmit: chosen.isSend,
    };
  }

  try {
    const r1 = await clickOnce(primaryFrame, true);
    if (r1.clicked) {
      if (r1.clickedConfirm) clickedConfirmAny = true;
      if (r1.clickedSubmit) clickedSubmitAny = true;
    }

    // 確認画面 → 送信ボタン という 2 ステップ想定で再度トライ
    const r2 = await clickOnce(primaryFrame, false);
    if (r2.clicked) {
      if (r2.clickedConfirm) clickedConfirmAny = true;
      if (r2.clickedSubmit) clickedSubmitAny = true;
    }
  } catch (err) {
    console.error("[form-submit] clickSubmitButtons error", err);
  }

  return { clickedConfirm: clickedConfirmAny, clickedSubmit: clickedSubmitAny };
}

// ========== フォーム送信本体 ==========

/**
 * 実際にフォーム送信を Playwright で行う
 * - targetUrl へアクセス
 * - plan.fields の name に対応する input/textarea/select に値を入力
 * - さらにラベル/placeholder を見て sender 情報を自動マッピングして埋める
 * - フレーム内の「確認」「送信」ボタンを順にクリック
 * - 最終的なページの HTML とデバッグ情報を返す
 *
 * ここでは「絶対に throw しない」ようにして、route.ts 側の try/catch を発火させない。
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
  const debug: FormSubmitDebug = {
    canAccessForm: null,
    inputTotal: 0,
    inputFilled: 0,
    selectTotal: 0,
    selectFilled: 0,
    checkboxTotal: 0,
    checkboxFilled: 0,
    hasActionButton: false,
    clickedConfirm: null,
    clickedSubmit: null,
    htmlFormCount: 0,
    htmlInputCount: 0,
    htmlTextInputCount: 0,
    htmlSelectCount: 0,
    htmlCheckboxCount: 0,
    htmlTextareaCount: 0,
    htmlHasSubmitLikeButton: false,
    lastErrorStep: null,
    lastErrorMessage: null,
  };

  let browser: any = null;
  let page: any = null;

  try {
    const pw: any = await import("playwright");
    const chromium = pw.chromium;

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) LotusRecruitBot/1.0 Chrome/120.0.0.0 Safari/537.36",
    });

    console.log("[form-submit] goto", targetUrl);
    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    // SPA / JS レンダリング対策で少し待つ
    await page.waitForTimeout(2500).catch(() => {});

    debug.canAccessForm = true;

    // 1. ページ＋iframe から「メインの問い合わせフォームがありそうなフレーム」を選定
    debug.lastErrorStep = "choosePrimaryFrame";
    const primaryFrame = await choosePrimaryFrameAndCollectHtmlStats(
      page,
      debug
    );

    // 2. LLM から返ってきた fields を name 属性ベースで可能な限り埋める
    debug.lastErrorStep = "fillByPlanFields";
    const fieldEntries = Object.entries(plan.fields || {});
    for (const [name, value] of fieldEntries) {
      if (!name) continue;
      await fillFieldByNameInFrames(page, primaryFrame, name, value);
    }

    // 3. sender / recipient / message を使った自動マッピング
    debug.lastErrorStep = "autoFillFieldsInFrame";
    await autoFillFieldsInFrame(primaryFrame, plan.meta);

    // 4. 埋めた後のフィールド数・入力済数などをカウント
    debug.lastErrorStep = "collectFieldStats";
    await collectFieldStatsInFrame(primaryFrame, debug);

    // 5. ボタンクリック（確認 → 送信）
    debug.lastErrorStep = "clickSubmitButtons";
    const clickResult = await clickSubmitButtons(page, primaryFrame);
    debug.clickedConfirm = clickResult.clickedConfirm;
    debug.clickedSubmit = clickResult.clickedSubmit;

    // 6. 最終 HTML 取得
    debug.lastErrorStep = "getFinalHtml";
    let html = "";
    let url = targetUrl;
    try {
      html = await page.content();
    } catch (err: any) {
      debug.lastErrorMessage =
        debug.lastErrorMessage || String(err?.message || err);
    }
    try {
      url = page.url();
    } catch {
      // ignore
    }

    debug.lastErrorStep = null;

    return {
      ok: true,
      status: 200,
      url,
      html,
      debug,
    };
  } catch (e: any) {
    console.error("[form-submit] error", e);
    if (!debug.lastErrorStep) {
      debug.lastErrorStep = "submitFormPlan_outer";
      debug.lastErrorMessage = String(e?.message || e);
    }

    let html = "";
    let url = targetUrl;
    try {
      if (page) {
        html = await page.content();
        url = page.url();
      }
    } catch {
      // ignore
    }

    debug.canAccessForm = debug.canAccessForm ?? false;

    return {
      ok: false,
      status: 0,
      url,
      html,
      debug,
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}

// ========== デバッグ専用（送信しない） ==========

/**
 * 送信はしないで、フォーム構造だけを Playwright で解析するデバッグ専用関数
 * - plan が生成できなかったり、submitFormPlan でエラーになった時用
 */
export async function collectFormDebugOnly(
  targetUrl: string
): Promise<FormSubmitDebug> {
  const debug: FormSubmitDebug = {
    canAccessForm: null,
    inputTotal: 0,
    inputFilled: 0,
    selectTotal: 0,
    selectFilled: 0,
    checkboxTotal: 0,
    checkboxFilled: 0,
    hasActionButton: false,
    clickedConfirm: null,
    clickedSubmit: null,
    htmlFormCount: 0,
    htmlInputCount: 0,
    htmlTextInputCount: 0,
    htmlSelectCount: 0,
    htmlCheckboxCount: 0,
    htmlTextareaCount: 0,
    htmlHasSubmitLikeButton: false,
    lastErrorStep: null,
    lastErrorMessage: null,
  };

  let browser: any = null;
  let page: any = null;

  try {
    const pw: any = await import("playwright");
    const chromium = pw.chromium;

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) LotusRecruitBot/1.0 Chrome/120.0.0.0 Safari/537.36",
    });

    console.log("[form-debug-only] goto", targetUrl);
    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.waitForTimeout(2500).catch(() => {});
    debug.canAccessForm = true;

    const primaryFrame = await choosePrimaryFrameAndCollectHtmlStats(
      page,
      debug
    );
    await collectFieldStatsInFrame(primaryFrame, debug);

    return debug;
  } catch (e: any) {
    console.error("[form-debug-only] error", e);
    debug.canAccessForm = debug.canAccessForm ?? false;
    debug.lastErrorStep = debug.lastErrorStep || "collectFormDebugOnly";
    debug.lastErrorMessage = debug.lastErrorMessage || String(e?.message || e);
    return debug;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}

// ========== 送信結果判定 ==========

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

  // 2. OpenAI での判定（微妙な場合のみ）
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
