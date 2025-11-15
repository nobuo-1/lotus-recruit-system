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

// UI デバッグ用の情報
export type FormSubmitDebug = {
  canAccessForm: boolean;
  hasCaptcha: boolean;
  inputTotal: number;
  inputFilled: number;
  selectTotal: number;
  selectFilled: number;
  checkboxTotal: number;
  checkboxFilled: number;
  hasActionButton: boolean;
  clickedConfirm: boolean;
  clickedSubmit: boolean;
};

/** HTML から reCAPTCHA / hCaptcha を検出する（route.ts からも使えるように export） */
export function detectCaptchaFromHtml(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("g-recaptcha") ||
    lower.includes("grecaptcha") ||
    lower.includes("recaptcha/api.js") ||
    lower.includes("hcaptcha") ||
    lower.includes("data-sitekey")
  );
}

/** 内部用エイリアス */
function hasCaptcha(html: string): boolean {
  return detectCaptchaFromHtml(html);
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
 *
 * - reCAPTCHA / hCaptcha があるページは null を返して自動送信不可にする
 * - OpenAI API が使えない・エラーのときは **throw せず**
 *   「簡易プラン（fields 空）」を返す → Playwright 側のヒューリスティック入力に任せる
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
    return null; // 待機リスト行き
  }

  // OpenAI が使えない場合は「簡易プラン」でヒューリスティック入力へ
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[form-plan] OPENAI_API_KEY is not set. use fallback empty plan."
    );
    return {
      method: "POST",
      action: ctx.targetUrl,
      fields: {},
    };
  }

  try {
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
      console.warn(
        "[form-plan] OpenAI error, fallback empty plan:",
        res.status,
        await res.text().catch(() => "")
      );
      return {
        method: "POST",
        action: ctx.targetUrl,
        fields: {},
      };
    }

    const data = (await res.json()) as {
      choices: { message?: { content?: string | null } }[];
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
      console.warn("[form-plan] empty content from OpenAI, fallback plan");
      return {
        method: "POST",
        action: ctx.targetUrl,
        fields: {},
      };
    }

    try {
      const parsed = JSON.parse(content) as FormPlan;
      if (
        !parsed ||
        !parsed.action ||
        !parsed.method ||
        typeof parsed.fields !== "object"
      ) {
        console.warn("[form-plan] invalid plan json, fallback");
        return {
          method: "POST",
          action: ctx.targetUrl,
          fields: {},
        };
      }
      const methodUpper =
        parsed.method.toUpperCase() === "GET" ? "GET" : "POST";
      return {
        method: methodUpper,
        action: parsed.action || ctx.targetUrl,
        fields: parsed.fields || {},
      };
    } catch (e) {
      console.warn("[form-plan] JSON.parse failed, fallback:", e);
      return {
        method: "POST",
        action: ctx.targetUrl,
        fields: {},
      };
    }
  } catch (e) {
    console.warn("[form-plan] unexpected error, fallback plan:", e);
    return {
      method: "POST",
      action: ctx.targetUrl,
      fields: {},
    };
  }
}

/**
 * 実際にフォーム送信を Playwright で行う
 *
 * - targetUrl へアクセス
 * - ヒューリスティックにフォームを特定（「お問い合わせ」「contact」などを含む form を優先）
 * - input / textarea / select / checkbox を走査して、sender/recipient/message から自動入力
 *   ※ plan.fields があっても、ここでは **基本的にヒューリスティック優先**
 * - プライバシーポリシー同意チェックは必ず ON にする
 * - 「確認」ボタン → 「送信」ボタンの順で押下を試みる
 * - 遷移後の HTML と、UI デバッグ用の統計を返す
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
  const pw = await import("playwright");
  const chromium = (pw as any).chromium as typeof import("playwright").chromium;

  const browser = await chromium.launch({ headless: true });
  let page: import("playwright").Page | null = null;

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
  };

  // 将来的に plan.fields["__lotus_ctx__"] 等から文脈を渡せるようにしておく
  let fillContext: {
    message: string;
    sender: FormSenderContext["sender"];
    recipient: FormSenderContext["recipient"];
  } = {
    message: "",
    sender: {},
    recipient: {},
  };
  try {
    const rawCtx = plan?.fields?.["__lotus_ctx__"];
    if (rawCtx && typeof rawCtx === "string") {
      const parsed = JSON.parse(rawCtx);
      fillContext = {
        message: String(parsed.message || ""),
        sender: parsed.sender || {},
        recipient: parsed.recipient || {},
      };
    }
  } catch {
    // 無視（文脈が無くてもデフォルト値で送る）
  }

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

    debug.canAccessForm = true;

    const firstHtml = await page.content();
    debug.hasCaptcha = hasCaptcha(firstHtml);

    // ===== 1. 対象フォームをマーキング =====
    await page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll("form"));
      let target: HTMLFormElement | null = null;
      for (const f of forms) {
        const txt = (f.textContent || "").toLowerCase();
        if (
          txt.includes("お問い合わせ") ||
          txt.includes("お問合せ") ||
          txt.includes("contact") ||
          txt.includes("資料請求") ||
          txt.includes("ご相談")
        ) {
          target = f as HTMLFormElement;
          break;
        }
      }
      if (!target && forms.length > 0) {
        target = forms[0] as HTMLFormElement;
      }
      if (target) {
        target.setAttribute("data-lotus-target-form", "1");
      }
    });

    // ===== 2. 入力欄のカウント & 自動入力 =====
    const stats = await page.evaluate((ctxRaw) => {
      const result = {
        inputTotal: 0,
        inputFilled: 0,
        selectTotal: 0,
        selectFilled: 0,
        checkboxTotal: 0,
        checkboxFilled: 0,
      };

      const form = document.querySelector(
        'form[data-lotus-target-form="1"]'
      ) as HTMLFormElement | null;
      if (!form) return result;

      const formEl = form as HTMLFormElement;

      const { message, sender, recipient } = ctxRaw as {
        message: string;
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

      const fields = Array.from(
        formEl.querySelectorAll("input, textarea, select")
      ) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];

      function getLabelText(el: Element): string {
        let labelText = "";
        const id = (el as any).id as string | undefined;
        if (id) {
          const lab = formEl.querySelector(`label[for="${id}"]`);
          if (lab) labelText = (lab.textContent || "").trim();
        }
        if (!labelText) {
          const lab = el.closest("label");
          if (lab) labelText = (lab.textContent || "").trim();
        }
        const placeholder = (el as any).getAttribute?.("placeholder") || "";
        const name = (el as any).getAttribute?.("name") || "";
        return `${labelText} ${placeholder} ${name}`.toLowerCase();
      }

      for (const el of fields) {
        const tag = el.tagName.toLowerCase();
        const type =
          (el as HTMLInputElement).type?.toLowerCase?.() ||
          (el.getAttribute && el.getAttribute("type")) ||
          "";

        // hidden / submit / button などはカウント対象外
        if (
          tag === "input" &&
          ["hidden", "submit", "button", "image", "file", "reset"].includes(
            type
          )
        ) {
          continue;
        }

        const text = getLabelText(el);
        let value: string | null = null;

        // === 値の決定（ヒューリスティック） ===
        if (
          tag === "textarea" ||
          /内容|問い合わせ|お問合せ|お問い合わせ|ご用件|message/.test(text)
        ) {
          value =
            message ||
            "お問い合わせありがとうございます。こちらは自動テスト送信です。";
        } else if (/会社名|御社名|法人名|組織名|社名|貴社/.test(text)) {
          value = (sender?.company as string) || "テスト株式会社";
        } else if (/氏名|お名前|担当者|ご担当者|your-name|name/.test(text)) {
          const ln = (sender?.last_name as string) || "";
          const fn = (sender?.first_name as string) || "";
          const full = ln && fn ? `${ln} ${fn}` : ln || fn || "山田 太郎";
          value = full;
        } else if (/姓|苗字|last/.test(text)) {
          value = (sender?.last_name as string) || "山田";
        } else if (/名|first/.test(text)) {
          value = (sender?.first_name as string) || "太郎";
        } else if (
          /メール|mail|e-mail|email/.test(text) &&
          type !== "checkbox"
        ) {
          value = (sender?.email as string) || "test@example.com";
        } else if (/電話|tel|phone/.test(text)) {
          value = (sender?.phone as string) || "03-1234-5678";
        } else if (/郵便|post|zipcode|zip/.test(text)) {
          value = (sender?.postal_code as string) || "123-4567";
        } else if (/都道府県/.test(text)) {
          value =
            (sender?.prefecture as string) ||
            (recipient?.prefecture as string) ||
            "大阪府";
        } else if (/住所|市区町村|番地/.test(text)) {
          value =
            (sender?.address as string) ||
            "大阪市北区テスト1-2-3 LOTUSビル 10F";
        } else if (/url|サイト|ホームページ|website|web/.test(text)) {
          value =
            (sender?.website as string) ||
            (recipient?.website as string) ||
            "https://example.com";
        } else if (/業種|業界/.test(text)) {
          value = (recipient?.industry as string) || "その他";
        }

        // === select ===
        if (tag === "select") {
          result.selectTotal++;
          const sel = el as HTMLSelectElement;
          let done = false;
          if (value) {
            for (const opt of Array.from(sel.options)) {
              const optText = (opt.textContent || "").trim();
              if (opt.value === value || optText === value) {
                sel.value = opt.value;
                done = true;
                break;
              }
            }
          }
          if (!done) {
            // 最初の「選択してください」以外を選ぶ
            const opt = Array.from(sel.options).find((o) => {
              const t = (o.textContent || "").trim();
              return (
                !!o.value &&
                !/選択してください|お選びください|please select/i.test(t)
              );
            });
            if (opt) {
              sel.value = opt.value;
              done = true;
            }
          }
          if (done) {
            result.selectFilled++;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
          }
          continue;
        }

        // === checkbox / radio ===
        if (tag === "input" && type === "checkbox") {
          result.checkboxTotal++;
          const isPrivacy = /同意|プライバシー|個人情報/.test(text);
          if (isPrivacy || value) {
            (el as HTMLInputElement).checked = true;
            result.checkboxFilled++;
            (el as HTMLInputElement).dispatchEvent(
              new Event("change", { bubbles: true })
            );
          }
          continue;
        }

        if (tag === "input" && type === "radio") {
          result.checkboxTotal++;
          if (value) {
            (el as HTMLInputElement).checked = true;
            result.checkboxFilled++;
            (el as HTMLInputElement).dispatchEvent(
              new Event("change", { bubbles: true })
            );
          }
          continue;
        }

        // === 通常の input / textarea ===
        if (tag === "input" || tag === "textarea") {
          result.inputTotal++;
          const v =
            value ||
            (tag === "textarea"
              ? message ||
                "お問い合わせありがとうございます。こちらは自動テスト送信です。"
              : "");
          if (v) {
            (el as any).value = v;
            result.inputFilled++;
            (el as any).dispatchEvent(new Event("input", { bubbles: true }));
            (el as any).dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }

      // プライバシー同意チェックボックスがあれば強制ON
      const privChecks = Array.from(
        formEl.querySelectorAll('input[type="checkbox"]')
      ) as HTMLInputElement[];
      for (const cb of privChecks) {
        const id = cb.id;
        let labelText = "";
        if (id) {
          const lab = formEl.querySelector(`label[for="${id}"]`);
          if (lab) labelText = (lab.textContent || "").trim();
        }
        if (!labelText) {
          const lab = cb.closest("label");
          if (lab) labelText = (lab.textContent || "").trim();
        }
        if (/同意|プライバシー|個人情報/.test(labelText)) {
          if (!cb.checked) {
            cb.checked = true;
            result.checkboxTotal++;
            result.checkboxFilled++;
            cb.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }

      return result;
    }, fillContext as any);

    debug.inputTotal = stats.inputTotal;
    debug.inputFilled = stats.inputFilled;
    debug.selectTotal = stats.selectTotal;
    debug.selectFilled = stats.selectFilled;
    debug.checkboxTotal = stats.checkboxTotal;
    debug.checkboxFilled = stats.checkboxFilled;

    // ===== 3. 送信ボタン / 確認ボタンのクリック =====
    async function clickOnce(
      preferConfirmFirst: boolean
    ): Promise<"none" | "confirm" | "submit"> {
      if (!page) return "none";

      const candidates = page.locator(
        'form[data-lotus-target-form="1"] button, ' +
          'form[data-lotus-target-form="1"] input[type="submit"], ' +
          'form[data-lotus-target-form="1"] input[type="button"]'
      );
      const count = await candidates.count();
      if (!count) {
        return "none";
      }
      debug.hasActionButton = true;

      type Cand = {
        idx: number;
        label: string;
        priority: number;
        kind: "confirm" | "submit";
      };
      const list: Cand[] = [];

      for (let i = 0; i < count; i++) {
        const el = candidates.nth(i);
        const text = (await el.innerText().catch(() => "")) || "";
        const valueAttr = (await el.getAttribute("value")) || "";
        const label = (text || valueAttr).trim();
        if (!label) continue;

        const isConfirm = /確認/.test(label);
        const isSend = /送信|送付|send/i.test(label);

        let priority = 99;
        let kind: "confirm" | "submit" = isConfirm ? "confirm" : "submit";

        if (preferConfirmFirst) {
          if (isConfirm) priority = 1;
          else if (isSend) {
            priority = 2;
            kind = "submit";
          }
        } else {
          if (isSend) {
            priority = 1;
            kind = "submit";
          } else if (isConfirm) {
            priority = 2;
            kind = "confirm";
          }
        }

        if (priority === 99) continue;
        list.push({ idx: i, label, priority, kind });
      }

      if (!list.length) return "none";
      list.sort((a, b) => a.priority - b.priority);
      const chosen = list[0];
      const target = candidates.nth(chosen.idx);

      console.log("[form-submit] click button:", chosen.label);

      await Promise.all([
        target.click().catch(() => {}),
        page
          .waitForLoadState("networkidle", { timeout: 15000 })
          .catch(() => {}),
      ]);

      await page.waitForTimeout(800).catch(() => {});
      return chosen.kind;
    }

    // 1回目: 「確認」を優先
    const firstClick = await clickOnce(true);
    if (firstClick === "confirm") debug.clickedConfirm = true;
    if (firstClick === "submit") debug.clickedSubmit = true;

    // 2回目: 「送信」を優先
    const secondClick = await clickOnce(false);
    if (secondClick === "submit") debug.clickedSubmit = true;
    if (secondClick === "confirm") debug.clickedConfirm = true;

    const finalHtml = await page.content();
    const finalUrl = page.url();

    return {
      ok: true,
      status: 200,
      url: finalUrl,
      html: finalHtml,
      debug,
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
 */
export async function judgeFormSubmissionResult(args: {
  url: string;
  html: string;
}): Promise<"success" | "failure" | "unknown"> {
  const snippet =
    args.html.length > 20000 ? args.html.slice(0, 20000) : args.html;
  const lower = snippet.toLowerCase();

  // 1. 固定キーワード判定
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

  // 2. 曖昧なものは OpenAI に判定させる（APIキー無い場合は unknown）
  if (!process.env.OPENAI_API_KEY) {
    return "unknown";
  }

  const systemPrompt = `
あなたは「問い合わせフォーム送信後のページ」が成功か失敗かを判定するロボットです。

# 仕事
- HTML の内容から、このページが「問い合わせ送信が正常に完了したサンクスページ」なのか、
  それとも「エラー・未入力警告・確認画面などでまだ送信されていないページ」なのかを判定します。

# 出力形式
- 必ず JSON だけを返してください
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
