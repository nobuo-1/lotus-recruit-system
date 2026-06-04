import type { Browser, Frame, Locator, Page } from "playwright";
import type { ManualCondition, SiteKey } from "./types";
import type { JobBoardLoginCredentials } from "./loginCredentials";

const MYNAVI_LOGIN_URL = "https://tenshoku.mynavi.jp/client/menu/index.cfm";
const MYNAVI_SCOUT_URL =
  "https://tenshoku.mynavi.jp/client/scout/index.cfm?chkcd=by49&fuseaction=ctsm_searchScouttarget_form&plan_id=1&contract_id=4&scout_classify_id=7";
const TYPE_LOGIN_URL = "https://hr.type.jp/";
const WOMAN_TYPE_LOGIN_URL = "https://hr.woman-type.jp/";

type FetchParams = {
  cond: ManualCondition;
  credentials: JobBoardLoginCredentials;
  startUrl?: string | null;
};

type JQueryLike = {
  trigger?: (eventName: string) => JQueryLike;
  selectpicker?: (command: string) => unknown;
};

type JQueryFactory = (element: Element) => JQueryLike;

export type PlaywrightCandidateResult = {
  siteKey: SiteKey;
  url: string;
  total: number | null;
  parseHint: string | null;
  errorMessage: string | null;
  debugLogs: string[];
};

function parseCount(text: string | null | undefined) {
  if (!text) return null;
  const match = text.replace(/\s+/g, "").match(/([0-9０-９,，]+)/);
  if (!match?.[1]) return null;
  const normalized = match[1]
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
    .replace(/[，,]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

async function launchBrowser(): Promise<Browser> {
  const pw = await import("playwright");
  return pw.chromium.launch({ headless: true });
}

async function firstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && (await locator.isVisible({ timeout: 800 }))) {
        return locator;
      }
    } catch {
      // try next selector
    }
  }
  return null;
}

async function fillFirst(page: Page, selectors: string[], value: string) {
  const locator = await firstVisible(page, selectors);
  if (!locator) return false;
  await locator.fill(value);
  return true;
}

async function clickFirst(page: Page, selectors: string[]) {
  const locator = await firstVisible(page, selectors);
  if (!locator) return false;
  await locator.click();
  return true;
}

function byText(page: Page, text: string) {
  return page.getByText(text, { exact: false }).first();
}

async function clickTextIfVisible(page: Page, text: string) {
  const locator = byText(page, text);
  try {
    if ((await locator.count()) > 0 && (await locator.isVisible({ timeout: 800 }))) {
      await locator.click();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function clickInputNearText(page: Page, text: string) {
  const candidates: Locator[] = [
    page
      .locator("label")
      .filter({ hasText: text })
      .locator('input[type="checkbox"], input[type="radio"]')
      .first(),
    page
      .locator("li, div, tr, dd")
      .filter({ hasText: text })
      .locator('input[type="checkbox"], input[type="radio"]')
      .first(),
  ];

  for (const locator of candidates) {
    try {
      if ((await locator.count()) > 0) {
        await locator.check({ force: true });
        return true;
      }
    } catch {
      try {
        await locator.click({ force: true });
        return true;
      } catch {
        // try next candidate
      }
    }
  }

  return clickTextIfVisible(page, text);
}

async function clickInputInCategory(page: Page, categorySuffix: string, text: string) {
  const title = page
    .locator(`a[id^="boss-categories-"][id$="-${categorySuffix}-label"]`)
    .filter({ hasText: text })
    .first();

  try {
    if ((await title.count()) > 0) {
      await title.click({ force: true });
      const href = await title.getAttribute("href");
      const id = href?.match(/#(.+)$/)?.[1] || titleIdToPanelId(await title.getAttribute("id"));
      if (id) {
        const ok = await checkTextInside(page.locator(`#${cssEscape(id)}`), text);
        if (ok) return true;
      }
    }
  } catch {
    // fall back to scanning all panels for the category
  }

  const panels = page.locator(`[id^="boss-categories-"][id$="-${categorySuffix}"]`);
  const count = await panels.count();
  for (let i = 0; i < count; i += 1) {
    const ok = await checkTextInside(panels.nth(i), text);
    if (ok) return true;
  }
  return false;
}

function titleIdToPanelId(id: string | null) {
  return id?.replace(/-label$/, "") || null;
}

function cssEscape(value: string) {
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

async function checkTextInside(scope: Locator, text: string) {
  const exactTexts = scope.getByText(text, { exact: true });
  const exactCount = await exactTexts.count();
  for (let i = 0; i < exactCount; i += 1) {
    const target = exactTexts.nth(i);
    if (!(await target.isVisible({ timeout: 200 }).catch(() => false))) continue;
    try {
      await target.click({ force: true });
      return true;
    } catch {
      // Some labels are not directly clickable; fall back to the nearest input.
    }
    const containers = [
      target.locator("xpath=ancestor-or-self::label[1]"),
      target.locator("xpath=ancestor::li[1]"),
      target.locator("xpath=ancestor::dd[1]"),
      target.locator("xpath=ancestor::tr[1]"),
      target.locator("xpath=ancestor::div[1]"),
    ];
    for (const container of containers) {
      if ((await container.count()) === 0) continue;
      const input = container.locator('input[type="checkbox"], input[type="radio"]').first();
      if (await checkInput(input)) return true;
    }
  }

  return false;
}

async function checkInput(input: Locator) {
  try {
    if ((await input.count()) > 0) {
      await input.check({ force: true });
      return true;
    }
  } catch {
    try {
      await input.click({ force: true });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function submitSearch(page: Page) {
  return clickFirst(page, [
    'button:has-text("検索")',
    'button:has-text("この条件で検索")',
    'button:has-text("検索する")',
    'input[type="submit"][value*="検索"]',
    'a:has-text("検索")',
  ]);
}

async function waitForPreviewUpdate(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function waitForPreviewStable(page: Page) {
  const locator = page.locator(".boss-search-preview-result").first();
  let previous: string | null = null;
  let stableCount = 0;
  for (let i = 0; i < 16; i += 1) {
    const current = await locator.textContent().catch(() => null);
    const normalized = current?.replace(/\s+/g, "").trim() || null;
    if (normalized && normalized === previous) {
      stableCount += 1;
      if (stableCount >= 3) return;
    } else {
      stableCount = 0;
      previous = normalized;
    }
    await page.waitForTimeout(500);
  }
}

function prefectureRegion(prefecture: string | null | undefined) {
  if (!prefecture) return null;
  if (["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"].includes(prefecture)) {
    return "北海道・東北";
  }
  if (["茨城県", "栃木県", "群馬県"].includes(prefecture)) return "北関東";
  if (["埼玉県", "千葉県", "東京都", "神奈川県"].includes(prefecture)) return "首都圏";
  if (["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県"].includes(prefecture)) {
    return "北陸・甲信越";
  }
  if (["岐阜県", "静岡県", "愛知県", "三重県"].includes(prefecture)) return "東海";
  if (["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"].includes(prefecture)) return "関西";
  if (["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"].includes(prefecture)) {
    return "中国・四国";
  }
  if (["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"].includes(prefecture)) {
    return "九州・沖縄";
  }
  return null;
}

function bossOccupationGroup(siteKey: SiteKey, job: string | null | undefined) {
  if (!job) return null;
  const normalized = job.replace(/\s+/g, "");
  if (siteKey === "womantype") {
    if (/営業|企画|マーケ/.test(normalized)) return "営業・企画・マーケティング系";
    if (/販売|サービス|接客/.test(normalized)) return "サービス・販売系";
    if (/クリエイティブ|メディア|Web|web/.test(job)) return "クリエイティブ系";
    if (/事務|アシスタント|経理|人事|コーポレート/.test(normalized)) return "事務・経理・人事系";
    if (/IT|エンジニア|データ|AI/.test(job)) return "ITエンジニア系";
    if (/医療|介護|福祉/.test(normalized)) return "介護・医療・福祉系";
    return "技術・専門職系、その他";
  }

  if (/IT|エンジニア|データ|AI/.test(job)) return "IT・Webエンジニア";
  if (/営業|カスタマー/.test(normalized)) return "営業系";
  if (/販売|サービス|接客/.test(normalized)) return "販売員・サービススタッフ系";
  if (/事務|アシスタント|コーポレート|経営/.test(normalized)) return "事務・管理部門系";
  if (/クリエイティブ|メディア/.test(normalized)) return "クリエイティブ系";
  if (/企画|マーケ/.test(normalized)) return "企画・マーケティング系";
  if (/建設|不動産/.test(normalized)) return "土木設計・建築・設備設計";
  if (/製造|ものづくり|電気|機械|素材|化学|食品|医薬/.test(normalized)) {
    return "電子・電気技術・メカトロ技術者";
  }
  if (/金融|コンサル|士業/.test(normalized)) return "ビジネスコンサルタント・専門職";
  return null;
}

function bossOccupationItemLabels(siteKey: SiteKey, job: string) {
  const labels = new Set<string>();
  const add = (value: string | null | undefined) => {
    const v = value?.trim();
    if (v) labels.add(v);
  };
  add(job);
  add(job.replace(/（[^）]+）/g, ""));

  if (/法人営業/.test(job)) {
    add("法人営業");
    add(siteKey === "womantype" ? "法人営業（BtoB）" : null);
  }
  if (/個人営業/.test(job)) {
    add("個人営業");
    add("個人営業（BtoC）");
  }
  if (/既存|ルート/.test(job)) {
    add("ルート営業");
    add("ルート営業、ルートセールス");
  }
  if (/技術営業|プリセールス/.test(job)) {
    add("技術営業");
    add("IT営業、技術営業、システム営業");
  }
  if (/チャネル|代理店/.test(job)) {
    add("代理店営業");
    add("代理店営業、パートナーセールス");
  }
  if (/インサイド|SDR|BDR/.test(job)) {
    add("内勤営業");
    add("内勤営業、カウンターセールス");
  }
  if (/マネージャー|拠点長/.test(job)) {
    add("営業管理・営業マネージャー");
  }
  if (/人材紹介|派遣営業/.test(job)) {
    add("人材紹介・派遣営業");
  }
  if (/医療機器/.test(job)) {
    add("MR、医療機器営業、医薬品卸");
  }
  if (/MR/.test(job)) {
    add("MR");
    add("MR、医療機器営業、医薬品卸");
  }
  if (/営業企画/.test(job)) {
    add("営業企画");
    add("販促企画、営業企画");
  }
  if (job === "その他") {
    add("その他営業職");
    add("その他営業関連職");
  }
  return [...labels];
}

async function visibleModal(page: Page) {
  const modal = page
    .locator(".reveal-modal:visible,.boss-modal:visible,[role=dialog]:visible")
    .first();
  if ((await modal.count()) > 0) return modal;
  return page.locator("body");
}

async function clickEditButtonByIndex(page: Page, index: number) {
  const editButtons = page.getByText("編集する", { exact: true });
  if ((await editButtons.count()) <= index) return false;
  await editButtons.nth(index).click();
  await page.waitForTimeout(500);
  return true;
}

async function setModalSelection(
  page: Page,
  groupText: string | null,
  itemText: string | string[] | null,
  selectAllInGroup: boolean
) {
  const modal = await visibleModal(page);
  if (groupText) {
    const group = modal.getByText(groupText, { exact: false }).first();
    if ((await group.count()) > 0) {
      await group.click({ force: true });
      await page.waitForTimeout(300);
    }
  }

  if (itemText) {
    const itemTexts = Array.isArray(itemText) ? itemText : [itemText];
    let checked = false;
    for (const item of itemTexts) {
      checked = await checkTextInside(modal, item);
      if (checked) break;
    }
    if (checked) {
      await page.waitForTimeout(300);
    } else if (selectAllInGroup) {
      await checkTextInside(modal, "すべて選択");
    }
  } else if (selectAllInGroup) {
    await checkTextInside(modal, "すべて選択");
  }

  const closeButton = modal.getByText("設定して閉じる", { exact: true }).first();
  if ((await closeButton.count()) > 0) {
    await closeButton.click({ force: true });
    await page.waitForTimeout(600);
  }
}

async function loginGeneric(page: Page, credentials: JobBoardLoginCredentials) {
  const userFilled = await fillFirst(
    page,
    [
      'input[name="loginId"]',
      'input[name="login_id"]',
      'input[name="mail"]',
      'input[name="email"]',
      'input[name="id"]',
      'input[type="email"]',
      'input[type="text"]',
    ],
    credentials.username
  );
  const passFilled = await fillFirst(
    page,
    [
      'input[name="password"]',
      'input[name="passwd"]',
      'input[name="pass"]',
      'input[type="password"]',
    ],
    credentials.password
  );

  if (!userFilled || !passFilled) {
    throw new Error("ログインフォームのIDまたはパスワード入力欄を検出できませんでした。");
  }

  const clicked = await clickFirst(page, [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("ログイン")',
    'a:has-text("ログイン")',
  ]);
  if (!clicked) throw new Error("ログインボタンを検出できませんでした。");
}

async function loginMynavi(page: Page, credentials: JobBoardLoginCredentials) {
  await page.goto(MYNAVI_LOGIN_URL, { waitUntil: "domcontentloaded" });
  const userFilled = await fillFirst(
    page,
    ['input[name="ap_login_id"]', 'input[name="login_id"]', 'input[type="text"]'],
    credentials.username
  );
  const passFilled = await fillFirst(
    page,
    ['input[name="ap_password"]', 'input[name="password"]', 'input[type="password"]'],
    credentials.password
  );
  if (!userFilled || !passFilled) {
    throw new Error("マイナビのログインフォームを検出できませんでした。");
  }
  await clickFirst(page, [
    'input[type="submit"]',
    'button[type="submit"]',
    'button:has-text("ログイン")',
  ]);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

function mynaviOccupationCategory(job: string | null | undefined) {
  if (!job) return null;
  const normalized = job.replace(/\s+/g, "");
  if (/IT|エンジニア|データ|AI|インフラ|開発/.test(job)) return "ITエンジニア";
  if (/Web|WEB|インターネット|ゲーム/.test(job)) return "WEB・インターネット・ゲーム";
  if (/営業|カスタマー/.test(normalized)) return "営業";
  if (/販売|サービス|接客|フード|アミューズメント/.test(normalized)) {
    return "販売・フード・アミューズメント";
  }
  if (/事務|アシスタント|経理|人事|総務|管理/.test(normalized)) return "管理・事務";
  if (/企画|経営|マーケ/.test(normalized)) return "企画・経営";
  if (/建築|土木|設備|施工/.test(normalized)) return "建築・土木";
  if (/医療|福祉|介護/.test(normalized)) return "医療・福祉";
  if (/電気|電子|機械|半導体/.test(normalized)) return "電気・電子・機械・半導体";
  if (/医薬|食品|化学|素材/.test(normalized)) return "医薬・食品・化学・素材";
  if (/コンサル|金融|不動産|士業/.test(normalized)) {
    return "コンサルタント・金融・不動産専門職";
  }
  if (/クリエイティブ|デザイン|メディア/.test(normalized)) return "クリエイティブ";
  if (/美容|ブライダル|ホテル|交通/.test(normalized)) return "美容・ブライダル・ホテル・交通";
  if (/保育|教育|通訳/.test(normalized)) return "保育・教育・通訳";
  if (/公共/.test(normalized)) return "公共サービス";
  if (/技能|配送|農林|水産|製造/.test(normalized)) return "技能工・設備・配送・農林水産 他";
  return null;
}

function mynaviOccupationLabels(job: string | null | undefined) {
  const category = mynaviOccupationCategory(job);
  if (category === "営業") {
    return [
      "営業・企画営業（法人向け）",
      "営業・企画営業（個人向け）",
      "営業マネジャー・営業管理職",
      "代理店営業・パートナーセールス",
      "内勤営業・カウンターセールス",
      "ルートセールス・渉外・外商",
      "海外営業",
      "メディカル営業（MR・MS・その他）",
      "その他営業・代理店営業・ルートセールス・MR関連職",
    ];
  }
  if (category === "ITエンジニア") {
    return [
      "システムエンジニア（アプリ設計／WEB・オープン・モバイル系）",
      "システムエンジニア（DB・ミドルウェア設計／汎用機系）",
      "システムエンジニア（パッケージソフト・ミドルウェア）",
      "プログラマー（WEB・オープン・モバイル系）",
      "プログラマー（汎用機系）",
      "社内システム開発・運用",
      "ネットワーク設計・構築",
      "サーバ設計・構築",
      "ネットワーク運用・監視",
      "サーバ・マシン運用・監視",
      "セキュリティコンサルタント",
      "セキュリティエンジニア",
      "データベース設計・構築",
      "通信設備設計・構築",
      "パッケージ導入コンサルタント",
      "システムコンサルタント",
      "プロジェクトマネジャー・リーダー（WEB・オープン・モバイル系）",
      "プロジェクトマネジャー・リーダー（汎用機系）",
      "プロジェクトマネジャー・リーダー（パッケージソフト・ミドルウェア）",
      "システムアナリスト",
      "プリセールス・セールスエンジニア",
      "その他システム関連職",
    ];
  }
  return [];
}

function mynaviPrefectureRegion(prefecture: string | null | undefined) {
  if (!prefecture) return null;
  if (prefecture === "北海道") return "北海道";
  if (["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"].includes(prefecture)) {
    return "東北";
  }
  if (["茨城県", "栃木県", "群馬県"].includes(prefecture)) return "北関東";
  if (["埼玉県", "千葉県", "東京都", "神奈川県"].includes(prefecture)) return "首都圏";
  if (["新潟県", "富山県", "石川県", "福井県"].includes(prefecture)) return "北陸";
  if (["山梨県", "長野県"].includes(prefecture)) return "甲信越";
  if (["岐阜県", "静岡県", "愛知県", "三重県"].includes(prefecture)) return "東海";
  if (["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"].includes(prefecture)) return "関西";
  if (["鳥取県", "島根県", "岡山県", "広島県", "山口県"].includes(prefecture)) return "中国";
  if (["徳島県", "香川県", "愛媛県", "高知県"].includes(prefecture)) return "四国";
  if (["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"].includes(prefecture)) {
    return "九州";
  }
  return null;
}

async function openMynaviModalFrame(page: Page, triggerSelector: string, urlPattern: RegExp) {
  await page.locator(triggerSelector).first().click({ force: true });
  for (let i = 0; i < 30; i += 1) {
    const frame = page
      .frames()
      .find((f) => f !== page.mainFrame() && urlPattern.test(f.url()));
    if (frame) {
      await frame.locator("body").waitFor({ state: "attached", timeout: 5000 });
      await frame.locator("body").waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      return frame;
    }
    await page.waitForTimeout(200);
  }
  throw new Error("マイナビの条件指定モーダルを検出できませんでした。");
}

async function clickFrameText(frame: Frame, text: string) {
  const exact = frame.getByText(text, { exact: true });
  const count = await exact.count();
  for (let i = 0; i < count; i += 1) {
    const target = exact.nth(i);
    if (!(await target.isVisible({ timeout: 200 }).catch(() => false))) continue;
    await target.click({ force: true });
    return true;
  }
  return false;
}

async function checkFrameInputNearText(frame: Frame, text: string) {
  const exact = frame.getByText(text, { exact: true });
  const count = await exact.count();
  for (let i = 0; i < count; i += 1) {
    const target = exact.nth(i);
    if (!(await target.isVisible({ timeout: 200 }).catch(() => false))) continue;
    const containers = [
      target.locator("xpath=ancestor-or-self::label[1]"),
      target.locator("xpath=ancestor::li[1]"),
      target.locator("xpath=ancestor::dd[1]"),
      target.locator("xpath=ancestor::tr[1]"),
      target.locator("xpath=ancestor::div[1]"),
    ];
    for (const container of containers) {
      if ((await container.count()) === 0) continue;
      const input = container.locator('input[type="checkbox"], input[type="radio"]').first();
      if (await checkInput(input)) return true;
    }
  }

  const scopes = frame.locator("label,li,tr,dd,div").filter({ hasText: text });
  const scopeCount = await scopes.count();
  for (let i = 0; i < scopeCount; i += 1) {
    const scope = scopes.nth(i);
    if (!(await scope.isVisible({ timeout: 200 }).catch(() => false))) continue;
    const input = scope.locator('input[type="checkbox"], input[type="radio"]').first();
    if (await checkInput(input)) return true;
  }
  return false;
}

async function checkVisibleFrameCheckboxes(frame: Frame) {
  return frame.evaluate(() => {
    const normalize = (value: string | null | undefined) =>
      (value || "").replace(/\s+/g, " ").trim();
    const isVisible = (el: Element | null) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        ((el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0) &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= window.innerHeight &&
        rect.left <= window.innerWidth
      );
    };
    const seen = new Set<string>();
    let checked = 0;
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    );
    for (const input of inputs) {
      if (input.disabled) continue;
      const scope = input.closest<HTMLElement>("label,li,tr,dd,div");
      if (!isVisible(scope)) continue;
      const text = normalize(scope?.textContent);
      if (!text || text.length > 120 || text.includes("こだわらない")) continue;
      const key = [input.id, input.name, input.value].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      if (!input.checked) input.click();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      checked += 1;
    }
    return checked;
  });
}

async function reflectMynaviFrame(page: Page, frame: Frame) {
  const clicked = await clickFrameText(frame, "チェックした項目を反映");
  if (!clicked) {
    throw new Error("マイナビの条件反映ボタンを検出できませんでした。");
  }
  await page.waitForTimeout(1000);
}

async function clickMynaviVisibleText(page: Page, text: string) {
  return page.evaluate((targetText) => {
    const normalize = (value: string | null | undefined) =>
      (value || "").replace(/\s+/g, "").trim();
    const target = normalize(targetText);
    const isVisible = (el: Element) => {
      const style = window.getComputedStyle(el);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        ((el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0)
      );
    };
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("button,a,input,span,div,td,th,label")
    ).filter(isVisible);
    const exact = elements.find((el) => {
      const value =
        el instanceof HTMLInputElement ? el.value || el.textContent : el.textContent;
      return normalize(value) === target;
    });
    if (exact) {
      exact.click();
      return true;
    }
    const partial = elements.find((el) => normalize(el.textContent).includes(target));
    if (partial) {
      partial.click();
      return true;
    }
    return false;
  }, text);
}

async function ensureMynaviCheckboxByText(page: Page, text: string, checked = true) {
  return page.evaluate(
    ({ targetText, shouldBeChecked }) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, "").trim();
      const target = normalize(targetText);
      const isVisible = (el: Element) => {
        const style = window.getComputedStyle(el);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          ((el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0)
        );
      };
      const root =
        Array.from(document.querySelectorAll<HTMLElement>("div,section,form,table"))
          .filter(
            (el) =>
              isVisible(el) &&
              normalize(el.textContent).includes("チェックした項目を反映") &&
              el.querySelector('input[type="checkbox"],input[type="radio"]')
          )
          .sort(
            (a, b) =>
              normalize(a.textContent).length - normalize(b.textContent).length
          )[0] || document.body;
      const scopes = Array.from(root.querySelectorAll<HTMLElement>("label,li,tr,dd,div"))
        .filter((el) => isVisible(el) && normalize(el.textContent).includes(target))
        .sort(
          (a, b) =>
            normalize(a.textContent).length - normalize(b.textContent).length
        );

      for (const scope of scopes) {
        const input = scope.querySelector<HTMLInputElement>(
          'input[type="checkbox"],input[type="radio"]'
        );
        if (!input || input.disabled) continue;
        if (input.checked !== shouldBeChecked) input.click();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      return false;
    },
    { targetText: text, shouldBeChecked: checked }
  );
}

async function selectFirstMynaviJobPosting(page: Page) {
  const select = page.locator('select#job_seq_no, select[name="job_seq_no"]').first();
  if ((await select.count()) === 0) return false;

  const selected = await page.evaluate(() => {
    const el = document.querySelector<HTMLSelectElement>(
      'select#job_seq_no, select[name="job_seq_no"]'
    );
    if (!el) return false;
    const option = Array.from(el.options).find((o) => o.value && !o.disabled);
    if (!option) return false;
    el.value = option.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const jq = (window as Window & { jQuery?: JQueryFactory }).jQuery;
    if (jq) {
      const picker = jq(el);
      picker.trigger?.("change");
      picker.selectpicker?.("refresh");
    }
    return true;
  });
  await page.waitForTimeout(500);
  return selected;
}

async function setMynaviSelectNearText(page: Page, label: string, optionPattern: RegExp) {
  return page.evaluate(
    ({ labelText, optionSource, optionFlags }) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, "").trim();
      const pattern = new RegExp(optionSource, optionFlags);
      const scopes = Array.from(
        document.querySelectorAll<HTMLElement>("tr,li,div,dd")
      )
        .filter((el) => normalize(el.textContent).includes(normalize(labelText)))
        .sort(
          (a, b) =>
            normalize(a.textContent).length - normalize(b.textContent).length
        );
      for (const scope of scopes) {
        const select = scope.querySelector<HTMLSelectElement>("select");
        if (!select) continue;
        const option = Array.from(select.options).find((o) =>
          pattern.test(normalize(o.textContent))
        );
        if (!option) continue;
        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        const jq = (window as Window & { jQuery?: JQueryFactory }).jQuery;
        if (jq) {
          const picker = jq(select);
          picker.trigger?.("change");
          picker.selectpicker?.("refresh");
        }
        return true;
      }
      return false;
    },
    {
      labelText: label,
      optionSource: optionPattern.source,
      optionFlags: optionPattern.flags,
    }
  );
}

async function applyMynaviPrefecture(page: Page, prefecture: string | null | undefined) {
  if (!prefecture) return;
  const frame = await openMynaviModalFrame(
    page,
    "#selectHopePrefecture",
    /ctcn_listCpyplace_form|hope_prefecture|prefecture/i
  );
  const region = mynaviPrefectureRegion(prefecture);
  if (region) {
    await clickFrameText(frame, region);
    await page.waitForTimeout(500);
  }
  const checked = await checkFrameInputNearText(frame, prefecture);
  if (!checked) throw new Error(`マイナビの希望勤務地「${prefecture}」を選択できませんでした。`);
  await reflectMynaviFrame(page, frame);
}

async function applyMynaviOccupation(page: Page, cond: ManualCondition) {
  const job = cond.internalSmall || cond.internalLarge;
  if (!job) return;

  const frame = await openMynaviModalFrame(
    page,
    "#selectHopeJob",
    /ctcn_listJob|hope_job|job/i
  );

  const category = mynaviOccupationCategory(cond.internalLarge || job);
  if (category) {
    await clickFrameText(frame, category);
    await page.waitForTimeout(500);
  }

  if (cond.internalSmall) {
    const checked = await checkFrameInputNearText(frame, cond.internalSmall);
    if (checked) {
      await reflectMynaviFrame(page, frame);
      return;
    }
  }

  let count = 0;
  for (const label of mynaviOccupationLabels(cond.internalLarge || job)) {
    if (await checkFrameInputNearText(frame, label)) count += 1;
  }
  if (count === 0) count = await checkVisibleFrameCheckboxes(frame);
  if (count === 0) {
    throw new Error(`マイナビの希望職種カテゴリ「${category ?? job}」を選択できませんでした。`);
  }

  await reflectMynaviFrame(page, frame);
}

async function submitMynaviSearch(page: Page) {
  const resultUrlWait = page
    .waitForURL(/ctsm_listScoutTarget_form|listScoutTarget/i, {
      timeout: 30000,
    })
    .catch(() => null);
  const clicked =
    (await clickFirst(page, [
      'input[type="submit"][value*="上記の内容で検索"]',
      'input[type="button"][value*="上記の内容で検索"]',
      'button:has-text("上記の内容で検索")',
      'a:has-text("上記の内容で検索")',
      'input[type="submit"][value*="検索"]',
      'button[type="submit"]',
    ])) ||
    (await submitSearch(page)) ||
    (await clickMynaviVisibleText(page, "上記の内容で検索する"));
  if (!clicked) throw new Error("マイナビの検索ボタンを検出できませんでした。");
  await resultUrlWait;
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

  if (/ctsm_searchScouttarget_form/i.test(page.url())) {
    const submitted = await page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, "").trim();
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          'input[type="submit"],input[type="button"],button,a'
        )
      );
      const target = controls.find((el) => {
        const inputValue =
          el instanceof HTMLInputElement ? el.value : el.textContent;
        const text = normalize(inputValue);
        return text.includes("上記の内容で検索") || text.includes("検索する");
      });
      target?.click();
      return Boolean(target);
    });
    if (submitted) {
      await page
        .waitForURL(/ctsm_listScoutTarget_form|listScoutTarget/i, {
          timeout: 30000,
        })
        .catch(() => null);
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    }
  }
}

async function enforceMynaviIncludeTargetFlags(page: Page) {
  const url = new URL(page.url());
  if (!/tenshoku\.mynavi\.jp$/i.test(url.hostname)) return;

  let changed = false;
  for (const [key, value] of [
    ["pickup_flg", "1"],
    ["history_regist_flg", "1"],
  ] as const) {
    if (url.searchParams.get(key) === value) continue;
    url.searchParams.set(key, value);
    changed = true;
  }

  const nextUrl = changed ? url.toString() : null;

  if (!nextUrl) return;

  await page.goto(nextUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
}

async function applyMynaviConditions(page: Page, cond: ManualCondition) {
  await selectFirstMynaviJobPosting(page);
  await applyMynaviPrefecture(page, cond.prefecture);
  await applyMynaviOccupation(page, cond);
  await setMynaviSelectNearText(page, "最終アクセス日", /1[ヶカかヵ]?月以内/);
  await ensureMynaviCheckboxByText(page, "保存リストの会員を含む", true);
  await ensureMynaviCheckboxByText(page, "過去に履歴書を閲覧した会員を含む", true);
  await submitMynaviSearch(page);
  await enforceMynaviIncludeTargetFlags(page);
}

async function applyBossConditions(page: Page, cond: ManualCondition) {
  await clickInputNearText(page, "希望勤務地のみ");
  if (cond.prefecture) {
    const clickedEdit = await clickEditButtonByIndex(page, 0);
    if (clickedEdit) {
      await setModalSelection(page, prefectureRegion(cond.prefecture), cond.prefecture, false);
    }
    const clicked =
      clickedEdit ||
      (await clickInputInCategory(page, "searching-prefectures", cond.prefecture)) ||
      (await clickInputInCategory(page, "prefectures", cond.prefecture)) ||
      (await clickInputNearText(page, cond.prefecture));
    if (clicked) await waitForPreviewUpdate(page);
  }

  const job = cond.internalSmall || cond.internalLarge;
  if (job) {
    const clickedEdit = await clickEditButtonByIndex(page, 2);
    if (clickedEdit) {
      const group = bossOccupationGroup(cond.siteKey, cond.internalLarge || job);
      const hasSmall = Boolean(cond.internalSmall);
      await setModalSelection(
        page,
        group,
        hasSmall ? bossOccupationItemLabels(cond.siteKey, job) : null,
        !hasSmall
      );
    }
    const clicked =
      clickedEdit ||
      (await clickInputInCategory(page, "desired-occupations", job)) ||
      (await clickInputNearText(page, job));
    if (clicked) await waitForPreviewUpdate(page);
  }

  await waitForPreviewStable(page);
}

async function readText(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: 8000 });
      const text = await locator.textContent();
      if (text) return { text, selector };
    } catch {
      // try next selector
    }
  }
  return { text: null, selector: null };
}

async function readBestCount(page: Page, selectors: string[]) {
  let best: { total: number; selector: string } | null = null;
  for (const selector of selectors) {
    const locators = page.locator(selector);
    const count = await locators.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const locator = locators.nth(i);
      if (!(await locator.isVisible({ timeout: 500 }).catch(() => false))) continue;
      const text = await locator.textContent().catch(() => null);
      const total = parseCount(text);
      if (total == null) continue;
      if (!best || total > best.total) best = { total, selector };
    }
    if (best) return best;
  }
  return { total: null, selector: null };
}

async function fetchMynaviCandidateCount(params: FetchParams) {
  const browser = await launchBrowser();
  const debugLogs: string[] = [];
  try {
    const page = await browser.newPage();
    await loginMynavi(page, params.credentials);
    await page.goto(params.startUrl || MYNAVI_SCOUT_URL, {
      waitUntil: "domcontentloaded",
    });
    await applyMynaviConditions(page, params.cond);
    const { total, selector } = await readBestCount(page, [
      ".hero-unit.hero-unitSec.mb15 .fs18",
      ".hero-unit .fs18",
      ".hero-unit.hero-unitSec.mb15",
      ".hero-unit",
      ".fs18",
    ]);
    return {
      siteKey: "mynavi" as const,
      url: page.url(),
      total,
      parseHint: selector,
      errorMessage: total == null ? "マイナビの求職者数を取得できませんでした。" : null,
      debugLogs,
    };
  } finally {
    await browser.close();
  }
}

async function fetchBossCandidateCount(params: FetchParams, loginUrl: string) {
  const browser = await launchBrowser();
  const debugLogs: string[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await loginGeneric(page, params.credentials);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    await applyBossConditions(page, params.cond);
    const { text, selector } = await readText(page, [
      ".boss-search-preview .boss-search-preview-result",
      ".boss-search-preview-result",
      ".boss-search-preview .hit-num",
      ".boss-search-preview [class*='hit-num']",
      "[class*='boss-search-preview'] [class*='hit-num']",
      ".hit-num",
    ]);
    const total = parseCount(text);
    return {
      siteKey: params.cond.siteKey,
      url: page.url(),
      total,
      parseHint: selector,
      errorMessage:
        total == null
          ? `${params.cond.siteKey} の boss-search-preview hit-num を取得できませんでした。`
          : null,
      debugLogs,
    };
  } finally {
    await browser.close();
  }
}

export async function fetchCandidateCountViaLoggedInBrowser(
  params: FetchParams
): Promise<PlaywrightCandidateResult> {
  if (params.cond.siteKey === "mynavi") return fetchMynaviCandidateCount(params);
  if (params.cond.siteKey === "type") {
    return fetchBossCandidateCount(params, TYPE_LOGIN_URL);
  }
  if (params.cond.siteKey === "womantype") {
    return fetchBossCandidateCount(params, WOMAN_TYPE_LOGIN_URL);
  }

  return {
    siteKey: params.cond.siteKey,
    url: params.startUrl ?? "",
    total: null,
    parseHint: null,
    errorMessage: "Dodaの求職者数取得は一旦ステイです。",
    debugLogs: [],
  };
}
