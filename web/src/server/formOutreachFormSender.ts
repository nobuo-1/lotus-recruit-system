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
  /**
   * planFormSubmission では「実際の name 属性」ではなく
   * __company__ / __email__ / __message__ のような意味付きキーを詰める。
   * 実際の DOM の input へのマッピングは submitFormPlan 側で行う。
   */
  fields: Record<string, string>;
};

// Playwright での送信時に収集するデバッグ情報
export type FormSubmitDebug = {
  canAccessForm: boolean | null;
  inputTotal: number | null;
  inputFilled: number | null;
  selectTotal: number | null;
  selectFilled: number | null;
  checkboxTotal: number | null;
  checkboxFilled: number | null;
  hasActionButton: boolean | null;
  clickedConfirm: boolean | null;
  clickedSubmit: boolean | null;
};

/** reCAPTCHA / hCaptcha を検出する（HTML 文字列ベース） */
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

/**
 * ★ OpenAI を使わずに「sender 情報だけを意味付きフィールドに詰める」軽量プラン生成
 *
 * - 実際の HTML 上の input name や select name をここでは決めない
 * - __company__ / __full_name__ / __email__ / __message__ 等のキーに
 *   form_outreach_senders + メッセージ本文を格納する
 * - DOM とのマッピングは submitFormPlan 側の Playwright ロジックで行う
 */
export async function planFormSubmission(
  ctx: FormSenderContext
): Promise<FormPlan | null> {
  const sender = ctx.sender || {};

  const last = (sender.last_name ?? "") + "";
  const first = (sender.first_name ?? "") + "";
  const fullName =
    (last + first).trim().length > 0
      ? `${last}${first}`
      : (sender.company ?? "") + "";

  const fields: Record<string, string> = {
    __company__: (sender.company ?? "") + "",
    __last_name__: last,
    __first_name__: first,
    __full_name__: fullName,
    __email__: (sender.email ?? "") + "",
    __phone__: (sender.phone ?? "") + "",
    __postal_code__: (sender.postal_code ?? "") + "",
    __prefecture__: (sender.prefecture ?? "") + "",
    __address__: (sender.address ?? "") + "",
    __website__: (sender.website ?? "") + "",
    __message__: ctx.message ?? "",
  };

  return {
    method: "POST",
    action: ctx.targetUrl || "",
    fields,
  };
}

/**
 * 実際にフォーム送信を Playwright で行う
 *
 * - targetUrl へアクセス
 * - iframe も含めて「一番フィールドが多い form」を探す
 *   （form が無い場合は、フィールド数が多い frame の body を対象にする）
 * - plan.fields (__company__, __email__ など) から sender 情報を取り出し、
 *   各 input / textarea / select / checkbox にヒューリスティックに埋める
 * - フォーム内の「確認」「送信」ボタンを順にクリック
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
  // Playwright を動的 import（型エラー回避 & serverless 対応のため）
  const pw = await import("playwright");
  const chromium = (pw as any).chromium as typeof import("playwright").chromium;

  const browser = await chromium.launch({ headless: true });

  const debug: FormSubmitDebug = {
    canAccessForm: null,
    inputTotal: null,
    inputFilled: null,
    selectTotal: null,
    selectFilled: null,
    checkboxTotal: null,
    checkboxFilled: null,
    hasActionButton: null,
    clickedConfirm: null,
    clickedSubmit: null,
  };

  // plan.fields に詰めた sender 情報をここで取り出す
  const fields = plan.fields || {};
  const semantic = {
    company: (fields["__company__"] ?? "") + "",
    lastName: (fields["__last_name__"] ?? "") + "",
    firstName: (fields["__first_name__"] ?? "") + "",
    fullName: (fields["__full_name__"] ?? "") + "",
    email: (fields["__email__"] ?? "") + "",
    phone: (fields["__phone__"] ?? "") + "",
    postalCode: (fields["__postal_code__"] ?? "") + "",
    prefecture: (fields["__prefecture__"] ?? "") + "",
    address: (fields["__address__"] ?? "") + "",
    website: (fields["__website__"] ?? "") + "",
    message: (fields["__message__"] ?? "") + "",
  };

  type FieldKind = "text" | "textarea" | "select" | "checkbox";
  type FieldMeta = {
    kind: FieldKind;
    source: "input" | "textarea" | "select";
    index: number; // 各 source ロケータ内での index
    name: string;
    type: string;
    placeholder: string;
    label: string;
  };

  function buildText(meta: FieldMeta) {
    const jp = `${meta.name || ""}${meta.placeholder || ""}${meta.label || ""}`;
    const lower = jp.toLowerCase();
    return { jp, lower };
  }

  function hasJP(jp: string, needles: string[]): boolean {
    return needles.some((n) => jp.includes(n));
  }

  function hasEn(lower: string, needles: string[]): boolean {
    return needles.some((n) => lower.includes(n));
  }

  type Action =
    | { kind: "fill"; meta: FieldMeta; value: string }
    | { kind: "check"; meta: FieldMeta; checked: boolean }
    | { kind: "select"; meta: FieldMeta; value: string };

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

    debug.canAccessForm = true;

    // ===== 1. iframe を含めて「一番フィールドが多い form or frame」を探す =====
    const allFrames = page.frames();
    let bestFormLocator: import("playwright").Locator | null = null;
    let bestFormScore = -1;

    for (const frame of allFrames) {
      const forms = frame.locator("form");
      const formCount = await forms.count();
      for (let i = 0; i < formCount; i++) {
        const f = forms.nth(i);
        const fieldCount = await f.locator("input, textarea, select").count();
        const score = fieldCount;
        if (score > bestFormScore) {
          bestFormScore = score;
          bestFormLocator = f;
        }
      }
    }

    let rootLocator: import("playwright").Locator;

    if (bestFormLocator) {
      rootLocator = bestFormLocator;
    } else {
      // form が1つも無い場合 → フィールド数が多い frame の body を対象にする
      let bestFrame = page.mainFrame();
      let bestFields = -1;
      for (const frame of allFrames) {
        const cnt = await frame.locator("input, textarea, select").count();
        if (cnt > bestFields) {
          bestFields = cnt;
          bestFrame = frame;
        }
      }
      rootLocator = bestFrame.locator("body");
    }

    // ===== 2. 対象領域内の input / textarea / select をスキャンしてメタ情報取得 =====
    const metas: FieldMeta[] = [];

    const inputLocator = rootLocator.locator("input");
    const textareaLocator = rootLocator.locator("textarea");
    const selectLocator = rootLocator.locator("select");

    const inputCount = await inputLocator.count();
    for (let i = 0; i < inputCount; i++) {
      const el = inputLocator.nth(i);
      const m = await el.evaluate((node: any) => {
        const type = (node.getAttribute("type") || "").toLowerCase();
        const name = node.getAttribute("name") || "";
        const placeholder = (node as any).placeholder || "";
        let label = "";
        const id = node.id;
        if (id) {
          const lab = document.querySelector(`label[for="${id}"]`);
          if (lab) label = lab.textContent || "";
        }
        if (!label) {
          let p = node.parentElement;
          while (p && p !== document.body) {
            if ((p as HTMLElement).tagName.toLowerCase() === "label") {
              label = p.textContent || "";
              break;
            }
            p = p.parentElement;
          }
        }
        return { type, name, placeholder, label };
      });

      const kind: FieldKind = m.type === "checkbox" ? "checkbox" : "text";

      metas.push({
        kind,
        source: "input",
        index: i,
        name: m.name || "",
        type: m.type || "",
        placeholder: m.placeholder || "",
        label: m.label || "",
      });
    }

    const textareaCount = await textareaLocator.count();
    for (let i = 0; i < textareaCount; i++) {
      const el = textareaLocator.nth(i);
      const m = await el.evaluate((node: any) => {
        const name = node.getAttribute("name") || "";
        const placeholder = (node as any).placeholder || "";
        let label = "";
        const id = node.id;
        if (id) {
          const lab = document.querySelector(`label[for="${id}"]`);
          if (lab) label = lab.textContent || "";
        }
        if (!label) {
          let p = node.parentElement;
          while (p && p !== document.body) {
            if ((p as HTMLElement).tagName.toLowerCase() === "label") {
              label = p.textContent || "";
              break;
            }
            p = p.parentElement;
          }
        }
        return { name, placeholder, label };
      });

      metas.push({
        kind: "textarea",
        source: "textarea",
        index: i,
        name: m.name || "",
        type: "textarea",
        placeholder: m.placeholder || "",
        label: m.label || "",
      });
    }

    const selectCount = await selectLocator.count();
    for (let i = 0; i < selectCount; i++) {
      const el = selectLocator.nth(i);
      const m = await el.evaluate((node: any) => {
        const name = node.getAttribute("name") || "";
        let label = "";
        const id = node.id;
        if (id) {
          const lab = document.querySelector(`label[for="${id}"]`);
          if (lab) label = lab.textContent || "";
        }
        if (!label) {
          let p = node.parentElement;
          while (p && p !== document.body) {
            if ((p as HTMLElement).tagName.toLowerCase() === "label") {
              label = p.textContent || "";
              break;
            }
            p = p.parentElement;
          }
        }
        return { name, label };
      });

      metas.push({
        kind: "select",
        source: "select",
        index: i,
        name: m.name || "",
        type: "select",
        placeholder: "",
        label: m.label || "",
      });
    }

    const textMetas = metas.filter(
      (m) => m.kind === "text" || m.kind === "textarea"
    );
    const checkboxMetas = metas.filter((m) => m.kind === "checkbox");
    const selectMetas = metas.filter((m) => m.kind === "select");

    debug.inputTotal = textMetas.length;
    debug.checkboxTotal = checkboxMetas.length;
    debug.selectTotal = selectMetas.length;

    // ===== 3. sender 情報を使って各フィールドに値を決める =====
    const actions: Action[] = [];
    let inputFilled = 0;
    let checkboxFilled = 0;
    let selectFilled = 0;

    for (const meta of metas) {
      const { jp, lower } = buildText(meta);

      // --- checkbox: プライバシーポリシー / 同意 だけをONにする ---
      if (meta.kind === "checkbox") {
        let checked = false;
        if (
          hasJP(jp, ["同意", "承諾", "プライバシ", "個人情報", "利用規約"]) ||
          hasEn(lower, ["agree", "consent", "privacy", "policy"])
        ) {
          checked = true;
        }
        if (checked) {
          actions.push({ kind: "check", meta, checked: true });
          checkboxFilled++;
        }
        continue;
      }

      // --- select: 都道府県など ---
      if (meta.kind === "select") {
        let value = "";
        if (hasJP(jp, ["都道府県"]) || hasEn(lower, ["prefecture", "pref"])) {
          value = semantic.prefecture;
        }

        if (value) {
          actions.push({ kind: "select", meta, value });
          selectFilled++;
        }
        continue;
      }

      // --- textarea: 原則メッセージ本文を入れる ---
      if (meta.kind === "textarea") {
        const value = semantic.message;
        if (value) {
          actions.push({ kind: "fill", meta, value });
          inputFilled++;
        }
        continue;
      }

      // --- 通常の input（text 等） ---
      let value = "";

      // メールアドレス
      if (
        hasJP(jp, ["メール", "ﾒｰﾙ"]) ||
        hasEn(lower, ["mail", "email", "e-mail"])
      ) {
        value = semantic.email;
      }
      // 電話
      else if (
        hasJP(jp, ["電話", "ＴＥＬ", "TEL", "連絡先", "携帯"]) ||
        hasEn(lower, ["tel", "phone"])
      ) {
        value = semantic.phone;
      }
      // 郵便番号
      else if (
        hasJP(jp, ["郵便", "郵便番号", "〒"]) ||
        hasEn(lower, ["zip", "postal"])
      ) {
        value = semantic.postalCode;
      }
      // 都道府県
      else if (
        hasJP(jp, ["都道府県"]) ||
        hasEn(lower, ["prefecture", "pref"])
      ) {
        value = semantic.prefecture;
      }
      // 住所
      else if (
        hasJP(jp, ["住所", "番地", "建物", "マンション", "ビル"]) ||
        hasEn(lower, ["address"])
      ) {
        value = semantic.address;
      }
      // 会社名
      else if (
        hasJP(jp, ["会社", "御社", "貴社", "社名"]) ||
        hasEn(lower, ["company", "corp", "corporation"])
      ) {
        value = semantic.company;
      }
      // 氏名（フルネーム）
      else if (
        hasJP(jp, ["氏名", "お名前", "ご担当者", "担当者"]) ||
        hasEn(lower, ["name", "contact"])
      ) {
        value =
          semantic.fullName || `${semantic.lastName}${semantic.firstName}`;
      }
      // 姓だけ
      else if (hasJP(jp, ["姓"]) || hasEn(lower, ["last"])) {
        value = semantic.lastName || semantic.fullName;
      }
      // 名だけ
      else if (hasJP(jp, ["名"]) || hasEn(lower, ["first"])) {
        value = semantic.firstName || semantic.fullName;
      }
      // Webサイト / URL
      else if (
        hasJP(jp, ["ホームページ", "ＨＰ", "HP", "サイト", "Webサイト"]) ||
        hasEn(lower, ["website", "url"])
      ) {
        value = semantic.website;
      }

      // type 属性からのフォールバック
      if (!value) {
        if (meta.type === "email") value = semantic.email;
        else if (meta.type === "tel") value = semantic.phone;
        else if (meta.type === "url") value = semantic.website;
      }

      // それでも決まらない場合は、会社名 → 氏名 → email → メッセージの順で適当に入れる
      if (!value) {
        value =
          semantic.company ||
          semantic.fullName ||
          semantic.email ||
          semantic.message;
      }

      if (value) {
        actions.push({ kind: "fill", meta, value });
        inputFilled++;
      }
    }

    debug.inputFilled = inputFilled;
    debug.selectFilled = selectFilled;
    debug.checkboxFilled = checkboxFilled;

    // ===== 4. 実際に Playwright で値を埋める =====
    for (const act of actions) {
      try {
        if (act.kind === "fill") {
          if (act.meta.source === "input") {
            const el = inputLocator.nth(act.meta.index);
            await el.fill(act.value);
          } else if (act.meta.source === "textarea") {
            const el = textareaLocator.nth(act.meta.index);
            await el.fill(act.value);
          }
        } else if (act.kind === "check") {
          const el = inputLocator.nth(act.meta.index);
          await el.check().catch(() => {});
        } else if (act.kind === "select") {
          const el = selectLocator.nth(act.meta.index);
          try {
            await el.selectOption({ label: act.value });
          } catch {
            await el.selectOption({ value: act.value }).catch(() => {});
          }
        }
      } catch {
        // 個別の失敗は無視
      }
    }

    // ===== 5. ボタン有無の判定 & クリック =====
    const buttonLocator = rootLocator.locator(
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
    debug.hasActionButton = hasActionButton;

    type ClickResult = {
      clicked: boolean;
      clickedConfirm: boolean;
      clickedSubmit: boolean;
    };

    async function clickOnce(
      preferConfirmFirst: boolean
    ): Promise<ClickResult> {
      const base = rootLocator;
      const candidates = base.locator(
        "button, input[type=submit], input[type=button]"
      );

      const count = await candidates.count();
      if (!count) {
        return {
          clicked: false,
          clickedConfirm: false,
          clickedSubmit: false,
        };
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
        return {
          clicked: false,
          clickedConfirm: false,
          clickedSubmit: false,
        };
      }

      list.sort((a, b) => a.priority - b.priority);
      const chosen = list[0];
      const target = candidates.nth(chosen.idx);
      console.log("[form-submit] click button:", chosen.label);

      await Promise.all([
        target.click().catch(() => {}),
        page!
          .waitForLoadState("networkidle", { timeout: 15000 })
          .catch(() => {}),
      ]);
      await page!.waitForTimeout(800).catch(() => {});

      return {
        clicked: true,
        clickedConfirm: chosen.isConfirm,
        clickedSubmit: chosen.isSend,
      };
    }

    let clickedConfirmAny = false;
    let clickedSubmitAny = false;

    // 1回目: 確認優先
    try {
      const r1 = await clickOnce(true);
      if (r1.clicked) {
        if (r1.clickedConfirm) clickedConfirmAny = true;
        if (r1.clickedSubmit) clickedSubmitAny = true;
      }
    } catch {
      // ignore
    }

    // 2回目: 送信優先
    try {
      const r2 = await clickOnce(false);
      if (r2.clicked) {
        if (r2.clickedConfirm) clickedConfirmAny = true;
        if (r2.clickedSubmit) clickedSubmitAny = true;
      }
    } catch {
      // ignore
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
    await browser.close();
  }
}

/**
 * ★ 送信はしないで、フォーム構造だけを Playwright で解析するデバッグ専用関数
 * - plan が生成できなかったり、submitFormPlan でエラーになった時用に利用できる
 */
export async function collectFormDebugOnly(
  targetUrl: string
): Promise<FormSubmitDebug> {
  const pw = await import("playwright");
  const chromium = (pw as any).chromium as typeof import("playwright").chromium;

  const browser = await chromium.launch({ headless: true });
  let page: import("playwright").Page | null = null;

  const debug: FormSubmitDebug = {
    canAccessForm: null,
    inputTotal: null,
    inputFilled: null,
    selectTotal: null,
    selectFilled: null,
    checkboxTotal: null,
    checkboxFilled: null,
    hasActionButton: null,
    clickedConfirm: null,
    clickedSubmit: null,
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

    let formLocator = page.locator("form").first();
    let hasForm = await formLocator.count();
    if (!hasForm) {
      formLocator = page.locator("body");
      hasForm = 1;
    }

    const rootLocator = formLocator;

    // input / textarea
    const inputLocator = rootLocator.locator(
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
    const selectLocator = rootLocator.locator("select");
    const selectTotal = await selectLocator.count();
    const selectFilledFlags = await selectLocator.evaluateAll((elements) => {
      return elements.map((el) => {
        const v = (el as HTMLSelectElement).value || "";
        return v.trim().length > 0;
      });
    });
    const selectFilled = selectFilledFlags.filter(Boolean).length;

    // checkbox
    const checkboxLocator = rootLocator.locator('input[type="checkbox"]');
    const checkboxTotal = await checkboxLocator.count();
    const checkboxFilledFlags = await checkboxLocator.evaluateAll(
      (elements) => {
        return elements.map((el) => (el as HTMLInputElement).checked === true);
      }
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
      const valueAttr = (await el.getAttribute("value")) || "";
      const label = (text || valueAttr).trim();
      if (!label) continue;
      if (/送信|確認|submit|confirm/i.test(label)) {
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

    return debug;
  } catch (e) {
    console.error("[form-debug-only] error", e);
    debug.canAccessForm = debug.canAccessForm ?? false;
    return debug;
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
