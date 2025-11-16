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

// Playwright での送信時に収集するデバッグ情報
export type FormSubmitDebug = {
  // 実行時の動き
  canAccessForm: boolean | null;
  hasCaptcha?: boolean | null;

  // 「実際に入力・クリックを試みたフォーム」に対するカウント
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
 * - どんなエラーでも throw せず、すべて null を返す
 */
export async function planFormSubmission(
  ctx: FormSenderContext
): Promise<FormPlan | null> {
  // ★ APIキーが無くてもフォーム送信自体は試したいので、throw しない
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[planFormSubmission] OPENAI_API_KEY is not set. Skip planning and fallback to heuristic only."
    );
    return null;
  }

  // HTML が長すぎるとトークンが厳しいので先頭だけを渡す
  const htmlSnippet =
    ctx.html.length > 20000 ? ctx.html.slice(0, 20000) : ctx.html;

  // reCAPTCHA / hCaptcha があれば、この時点で自動送信不可として null を返す
  if (hasCaptcha(htmlSnippet)) {
    console.log("[form-plan] captcha detected, skip auto submission:", {
      url: ctx.targetUrl,
    });
    return null; // route.ts 側では CAPTCHA の場合のみ自動送信を完全スキップ
  }

  const userPayload = {
    targetUrl: ctx.targetUrl,
    html: htmlSnippet,
    message: ctx.message,
    sender: ctx.sender,
    recipient: ctx.recipient,
  };

  const system = buildSystemPrompt();

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
        // ★ JSON オブジェクトだけを返させる
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(
        "[planFormSubmission] OpenAI API error:",
        res.status,
        await res.text().catch(() => "")
      );
      return null;
    }

    const data = (await res.json()) as {
      choices: { message?: { content?: string | null } }[];
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) return null;

    let parsed: FormPlan;
    try {
      parsed = JSON.parse(content) as FormPlan;
    } catch (e) {
      console.warn(
        "[planFormSubmission] JSON parse error:",
        e,
        "content:",
        content
      );
      return null;
    }

    if (
      !parsed ||
      !parsed.action ||
      !parsed.method ||
      typeof parsed.fields !== "object"
    ) {
      console.warn(
        "[planFormSubmission] invalid plan structure received:",
        parsed
      );
      return null;
    }

    const methodUpper =
      parsed.method.toUpperCase() === "GET"
        ? "GET"
        : ("POST" as "GET" | "POST");

    return {
      method: methodUpper,
      action: parsed.action,
      fields: parsed.fields || {},
    };
  } catch (e) {
    console.error("[planFormSubmission] unexpected error:", e);
    return null;
  }
}

/* =========================================================
 * 共通ヘルパー: ページ全体（全フレーム）のフォーム構造をざっくり集計する
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

      const textInputs = inputs.locator(
        ':not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])'
      );
      htmlTextInputCount += await textInputs.count();

      const checkboxes = inputs.locator('[type="checkbox"]');
      htmlCheckboxCount += await checkboxes.count();

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
 *  - ① 入力欄付き <form> を優先
 *  - ② それが無ければ、入力欄を持つ <body>（= 擬似フォーム）を採用
 *  - ③ どちらも無ければ null
 * =======================================================*/

async function findTargetForm(
  page: Page
): Promise<{ frame: Frame; form: Locator } | null> {
  const frames = page.frames();

  // 1. まずは「入力欄を1つ以上持つ <form>」を全フレームから探す
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

  // 2. <form> 内に入力欄が無い場合でも、
  //    「body 直下（またはその子孫）に入力欄があるフレーム」を擬似フォームとして扱う
  for (const frame of frames) {
    try {
      const root = frame.locator("body");
      const controls = root.locator(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select'
      );
      const cCount = await controls.count();
      if (cCount > 0) {
        // このフレームの body 全体をフォームルートとして扱う
        return { frame, form: root };
      }
    } catch {
      continue;
    }
  }

  // 3. 念のため mainFrame だけでも再チェック
  try {
    const mainFrame = page.mainFrame();
    const root = mainFrame.locator("body");
    const controls = root.locator(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select'
    );
    if ((await controls.count()) > 0) {
      return { frame: mainFrame, form: root };
    }
  } catch {
    // ignore
  }

  return null;
}

/* =========================================================
 * 共通ヘルパー: 1つのフォーム（Locator）内の「入力済/総数」を集計
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

  const selectLocator = formRoot.locator("select");
  const selectTotal = await selectLocator.count();
  const selectFilledFlags = await selectLocator.evaluateAll((elements) => {
    return elements.map((el) => {
      const v = (el as HTMLSelectElement).value || "";
      return v.trim().length > 0;
    });
  });
  const selectFilled = selectFilledFlags.filter(Boolean).length;

  const checkboxLocator = formRoot.locator('input[type="checkbox"]');
  const checkboxTotal = await checkboxLocator.count();
  const checkboxFilledFlags = await checkboxLocator.evaluateAll((elements) => {
    return elements.map((el) => (el as HTMLInputElement).checked === true);
  });
  const checkboxFilled = checkboxFilledFlags.filter(Boolean).length;

  const buttonLocator = formRoot.locator(
    'button, input[type="submit"], input[type="button"], a[role="button"], a.button, a.btn'
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
 * 共通ヘルパー: フィールド種別推定 & オートフィル
 * =======================================================*/

function guessFieldKind(
  name: string | null,
  placeholder: string | null,
  type: string | null
):
  | "company"
  | "fullName"
  | "lastName"
  | "firstName"
  | "email"
  | "phone"
  | "postal"
  | "prefecture"
  | "address"
  | "subject"
  | "message"
  | "other" {
  const n = (name || "").toLowerCase();
  const p = (placeholder || "").toLowerCase();
  const t = (type || "").toLowerCase();
  const text = n + " " + p;

  if (t === "email" || /mail|e-?mail/.test(text)) return "email";
  if (t === "tel" || /tel|phone|電話/.test(text)) return "phone";
  if (/zip|postal|郵便/.test(text)) return "postal";
  if (/pref|都道府県/.test(text)) return "prefecture";
  if (/住所|address/.test(text)) return "address";
  if (/会社|corporate|corp|company/.test(text)) return "company";
  if (/姓|last/.test(text)) return "lastName";
  if (/名|first/.test(text)) return "firstName";
  if (/お名前|氏名|name/.test(text)) return "fullName";
  if (/件名|subject|題名/.test(text)) return "subject";
  if (/内容|message|本文|お問い合わせ/.test(text)) return "message";

  return "other";
}

type AutoFillProfile = {
  company: string;
  fullName: string;
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
  postal: string;
  prefecture: string;
  address: string;
  subject: string;
  message: string;
};

async function autoFillForm(
  formRoot: Locator,
  plan: FormPlan | null,
  profile: AutoFillProfile
) {
  const fieldEntries = plan?.fields ? Object.entries(plan.fields) : [];

  // 1. name 一致フィールドには plan.fields を優先
  for (const [name, value] of fieldEntries) {
    const selector = `input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`;
    const locator = formRoot.locator(selector);
    const count = await locator.count();
    if (!count) continue;

    const first = locator.first();
    const tagName = await first.evaluate((node: any) =>
      String(node.tagName || "").toLowerCase()
    );
    const typeAttr = await first.evaluate(
      (node: any) => node.getAttribute && node.getAttribute("type")
    );
    const type = String(typeAttr || "").toLowerCase();

    if (tagName === "select") {
      try {
        await first.selectOption({ value: value });
      } catch {
        await first.selectOption({ label: value }).catch(() => {});
      }
      continue;
    }

    if (tagName === "input" && (type === "checkbox" || type === "radio")) {
      if (value && value !== "0" && value.toLowerCase() !== "false") {
        await first.check().catch(() => {});
      } else {
        await first.uncheck().catch(() => {});
      }
      continue;
    }

    await first.fill(value ?? "").catch(() => {});
  }

  // 2. 残りを総当たりで埋める
  const controls = formRoot.locator(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select'
  );
  const total = await controls.count();

  for (let i = 0; i < total; i++) {
    const el = controls.nth(i);
    const tag = (
      await el.evaluate((node: any) => String(node.tagName || "").toLowerCase())
    ).toLowerCase();

    const nameAttr = await el.getAttribute("name").catch(() => null);
    const typeAttr = await el.getAttribute("type").catch(() => null);
    const placeholderAttr = await el
      .getAttribute("placeholder")
      .catch(() => null);

    const type = (typeAttr || "").toLowerCase();

    // すでに値が入っていればスキップ
    try {
      const isFilled = await el.evaluate((node: any) => {
        const tagName = (node.tagName || "").toLowerCase();
        if (tagName === "textarea") {
          return !!(node as HTMLTextAreaElement).value;
        }
        if (tagName === "select") {
          return !!(node as HTMLSelectElement).value;
        }
        const t = (
          (node as HTMLInputElement).getAttribute("type") || ""
        ).toLowerCase();
        if (t === "checkbox" || t === "radio") {
          return (node as HTMLInputElement).checked;
        }
        return !!(node as HTMLInputElement).value;
      });
      if (isFilled) continue;
    } catch {
      // ignore
    }

    if (tag === "select") {
      try {
        const options = (await el.evaluate((node: any) => {
          const sel = node as HTMLSelectElement;
          return Array.from(sel.options).map((o) => ({
            value: o.value,
            label: o.label,
          }));
        })) as { value: string; label: string }[];

        let targetValue = "";
        if (options.length > 1 && options[0].value === "") {
          targetValue = options[1].value;
        } else if (options.length > 0) {
          targetValue = options[0].value;
        }
        if (targetValue) {
          await el.selectOption({ value: targetValue }).catch(() => {});
        }
      } catch {
        // ignore
      }
      continue;
    }

    if (tag === "textarea" || (tag === "input" && type === "text")) {
      const kind = guessFieldKind(nameAttr, placeholderAttr, typeAttr);
      let value = "";

      switch (kind) {
        case "company":
          value = profile.company;
          break;
        case "fullName":
          value = profile.fullName;
          break;
        case "lastName":
          value = profile.lastName || profile.fullName;
          break;
        case "firstName":
          value = profile.firstName || profile.fullName;
          break;
        case "email":
          value = profile.email;
          break;
        case "phone":
          value = profile.phone;
          break;
        case "postal":
          value = profile.postal;
          break;
        case "prefecture":
          value = profile.prefecture;
          break;
        case "address":
          value = profile.address;
          break;
        case "subject":
          value = profile.subject;
          break;
        case "message":
          value = profile.message;
          break;
        case "other":
        default:
          value = profile.company || profile.fullName || "お問い合わせ";
          break;
      }

      await el.fill(value).catch(() => {});
      continue;
    }

    if (tag === "input" && (type === "email" || type === "tel")) {
      const kind = guessFieldKind(nameAttr, placeholderAttr, typeAttr);
      const value =
        kind === "phone"
          ? profile.phone
          : kind === "email"
          ? profile.email
          : profile.email;
      await el.fill(value).catch(() => {});
      continue;
    }

    if (tag === "input" && (type === "checkbox" || type === "radio")) {
      try {
        await el.check().catch(() => {});
      } catch {
        // ignore
      }
      continue;
    }
  }
}

/* =========================================================
 * 共通ヘルパー: ボタンを 1 回押す（確認優先 or 送信優先）
 *  - formRoot 内にボタンが無ければページ全体からも探す
 * =======================================================*/

async function clickOnceInFormOrPage(
  page: Page,
  formRoot: Locator,
  preferConfirmFirst: boolean
): Promise<{
  clicked: boolean;
  clickedConfirm: boolean;
  clickedSubmit: boolean;
}> {
  async function pickAndClick(base: Locator) {
    const candidates = base.locator(
      "button, input[type=submit], input[type=button], a[role='button'], a.button, a.btn"
    );
    const count = await candidates.count();
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
      const valueAttr = (await el.getAttribute("value")) || "";
      const label = (text || valueAttr).trim();
      if (!label) continue;

      const isConfirm = /確認|confirm/i.test(label);
      const isSend = /送信|submit/i.test(label);

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
      target.click().catch(() => {}),
      page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}),
    ]);

    // JS による画面書き換えを待つ
    await page.waitForTimeout(800).catch(() => {});
    return {
      clicked: true,
      clickedConfirm: chosen.isConfirm,
      clickedSubmit: chosen.isSend,
    };
  }

  // 1. まずはフォーム内で探す
  const r1 = await pickAndClick(formRoot);
  if (r1.clicked) return r1;

  // 2. 見つからなければページ全体から探す
  const r2 = await pickAndClick(page.locator("body"));
  return r2;
}

/* =========================================================
 * 実際にフォーム送信を Playwright で行う（フレーム横断・オートフィル付き）
 *  - 「絶対に throw しない」で route 側に返す
 * =======================================================*/

export async function submitFormPlan(
  targetUrl: string,
  plan: FormPlan | null,
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

  // 汎用的なデフォルトプロファイル（必要なら route 側で差し込みに寄せてもOK）
  const profile: AutoFillProfile = {
    company: "株式会社LOTUS",
    fullName: "山田 太郎",
    lastName: "山田",
    firstName: "太郎",
    email: "info@example.com",
    phone: "090-1234-5678",
    postal: "123-4567",
    prefecture: "大阪府",
    address: "大阪市北区◯◯1-2-3",
    subject: "お問い合わせの件",
    message: "お問い合わせさせていただきます。こちらは自動送信テストです。",
  };

  let browser: import("playwright").Browser | null = null;
  let page: import("playwright").Page | null = null;

  try {
    const pw = await import("playwright");
    const chromium = (pw as any)
      .chromium as typeof import("playwright").chromium;

    browser = await chromium.launch({ headless: true });

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

    // JS による動的レンダリングを少し長めに待つ（フォーム埋め込み系対策）
    await page.waitForTimeout(4000).catch(() => {});

    debug.canAccessForm = true;

    // 1. ページ全体の構造情報（全フレーム対象）
    try {
      const htmlStats = await collectHtmlStructureStats(page);
      debug.htmlFormCount = htmlStats.htmlFormCount;
      debug.htmlInputCount = htmlStats.htmlInputCount;
      debug.htmlTextInputCount = htmlStats.htmlTextInputCount;
      debug.htmlSelectCount = htmlStats.htmlSelectCount;
      debug.htmlCheckboxCount = htmlStats.htmlCheckboxCount;
      debug.htmlTextareaCount = htmlStats.htmlTextareaCount;
      debug.htmlHasSubmitLikeButton = htmlStats.htmlHasSubmitLikeButton;
    } catch (e) {
      console.error("[form-submit] collectHtmlStructureStats error", e);
    }

    // 2. 送信対象フォームを 1つ決定（iframe 内も含めて探索）
    const target = await findTargetForm(page);
    if (!target) {
      console.log("[form-submit] no form or inputs found in any frame");
      const html = await page.content();
      const url = page.url();
      return {
        ok: false,
        status: 0,
        url,
        html,
        debug,
      };
    }

    const { form } = target;
    const formRoot = form;

    // 3. フォームをオートフィル（plan.fields + 汎用オートフィル）
    try {
      await autoFillForm(formRoot, plan, profile);
    } catch (e) {
      console.error("[form-submit] autoFillForm error", e);
    }

    // 4. 入力後のフォーム内カウント
    try {
      const filledStats = await collectFilledStatsForForm(formRoot);
      debug.inputTotal = filledStats.inputTotal;
      debug.inputFilled = filledStats.inputFilled;
      debug.selectTotal = filledStats.selectTotal;
      debug.selectFilled = filledStats.selectFilled;
      debug.checkboxTotal = filledStats.checkboxTotal;
      debug.checkboxFilled = filledStats.checkboxFilled;
      debug.hasActionButton = filledStats.hasActionButton;
    } catch (e) {
      console.error("[form-submit] collectFilledStatsForForm error", e);
    }

    // 5. ボタンクリック（確認 → 送信）
    let clickedConfirmAny = false;
    let clickedSubmitAny = false;

    try {
      const r1 = await clickOnceInFormOrPage(page, formRoot, true);
      if (r1.clicked) {
        if (r1.clickedConfirm) clickedConfirmAny = true;
        if (r1.clickedSubmit) clickedSubmitAny = true;
      }

      await page.waitForTimeout(1200).catch(() => {});

      const r2 = await clickOnceInFormOrPage(page, formRoot, false);
      if (r2.clicked) {
        if (r2.clickedConfirm) clickedConfirmAny = true;
        if (r2.clickedSubmit) clickedSubmitAny = true;
      }
    } catch (e) {
      console.error("[form-submit] clickOnceInFormOrPage error", e);
    }

    debug.clickedConfirm = clickedConfirmAny;
    debug.clickedSubmit = clickedSubmitAny;

    const html = await page.content();
    const url = page.url();

    return {
      ok: true,
      status: 200,
      url,
      html,
      debug,
    };
  } catch (e) {
    console.error("[form-submit] error", e);
    if (page) {
      try {
        const html = await page.content();
        const url = page.url();
        return {
          ok: false,
          status: 0,
          url,
          html,
          debug,
        };
      } catch {
        // ignore
      }
    }
    debug.canAccessForm = debug.canAccessForm ?? false;
    return {
      ok: false,
      status: 0,
      url: targetUrl,
      html: "",
      debug,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/* =========================================================
 * 送信はせず、フォーム構造だけを Playwright で解析するデバッグ専用関数
 *  - こちらも「絶対に throw しない」
 * =======================================================*/

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

  let browser: import("playwright").Browser | null = null;
  let page: import("playwright").Page | null = null;

  try {
    const pw = await import("playwright");
    const chromium = (pw as any)
      .chromium as typeof import("playwright").chromium;

    browser = await chromium.launch({ headless: true });

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

    await page.waitForTimeout(4000).catch(() => {});

    debug.canAccessForm = true;

    const htmlStats = await collectHtmlStructureStats(page);
    debug.htmlFormCount = htmlStats.htmlFormCount;
    debug.htmlInputCount = htmlStats.htmlInputCount;
    debug.htmlTextInputCount = htmlStats.htmlTextInputCount;
    debug.htmlSelectCount = htmlStats.htmlSelectCount;
    debug.htmlCheckboxCount = htmlStats.htmlCheckboxCount;
    debug.htmlTextareaCount = htmlStats.htmlTextareaCount;
    debug.htmlHasSubmitLikeButton = htmlStats.htmlHasSubmitLikeButton;

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
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/* =========================================================
 * フォーム送信後のページが「送信成功」かどうかを判定する
 *  - キーワードの誤判定を減らしつつ、成功パターンも拡張
 * =======================================================*/

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
    "送信が完了いたしました",
    "送信完了",
    "送信が正常に完了",
    "お問い合わせを受け付けました",
    "お問い合わせを受け付け致しました",
    "お問い合わせありがとうございます",
    "ありがとうございました",
    "送信いただきありがとうございました",
    "お申し込みを受け付けました",
    "ご登録ありがとうございました",
    "メッセージを送信しました",
  ];
  const errorKeywords = [
    "エラーが発生しました",
    "エラーが発生",
    "必須項目が入力されていません",
    "必須項目をご入力ください",
    "必須項目を入力してください",
    "入力内容をご確認ください",
    "正しく入力されていない項目があります",
    "もう一度入力してください",
    "再度入力",
  ];

  const hasSuccess = successKeywords.some((k) => snippet.includes(k));
  const hasError =
    errorKeywords.some((k) => snippet.includes(k)) || lower.includes(" error ");

  if (hasSuccess && !hasError) {
    return "success";
  }
  if (hasError && !hasSuccess) {
    return "failure";
  }

  // 2. ここから先は AI による最終判定
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
- 「必須項目が入力されていません」「正しく入力されていない項目があります」「入力内容をご確認ください」
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
