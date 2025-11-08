// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * この修正では「業種」を必ず
 * web/src/app/form-outreach/settings/filters/page.tsx の業種モーダルに存在する“小分類名”
 * に正規化し、大分類はその逆引きで決定します。
 * （LLM（ChatGPT API）は任意。OPENAI_API_KEY があれば優先的に分類、なければ規則ベース。）
 */

/** ===== Env ===== */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** ===== Types ===== */
type Filters = {
  prefectures?: string[];
  employee_size_ranges?: string[];
  keywords?: string[];
  industries_large?: string[];
  industries_small?: string[];
  capital_min?: number | null;
  capital_max?: number | null;
  established_from?: string | null;
  established_to?: string | null;
};

type ProspectRow = {
  id: string;
  tenant_id: string;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  phone_number: string | null;
  industry: string | null; // ← 小分類名（モーダル準拠）を格納
  company_size: string | null;
  job_site_source: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  prefectures: string[] | null;
  corporate_number: string | null;
  hq_address: string | null;
  capital: number | null;
  established_on: string | null;
  phone?: string | null;
};

function getAdmin(): { sb: any; usingServiceRole: boolean } {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE)
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE) as any,
      usingServiceRole: true,
    };
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  return {
    sb: createClient(SUPABASE_URL, ANON_KEY) as any,
    usingServiceRole: false,
  };
}

function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

/** =========================
 * 業種タクソノミ（モーダルと同一）
 * =========================
 * filters/page.tsx の INDUSTRY_LARGE / INDUSTRY_CATEGORIES をサーバ側にも複製
 * （UIのモーダルに存在する“小分類”のみを正解として返す）
 */
const INDUSTRY_LARGE = [
  "農林水産",
  "鉱業・採石",
  "建設",
  "製造（食品・生活）",
  "製造（素材・化学・資源）",
  "製造（機械・電機・輸送）",
  "エネルギー・公益",
  "情報通信・メディア",
  "運輸・物流・郵便",
  "卸売",
  "小売",
  "金融・保険・不動産",
  "専門サービス・士業",
  "宿泊・飲食",
  "生活関連・娯楽・スポーツ",
  "教育・学習支援",
  "医療・福祉",
  "公務・団体・NPO",
  "環境・安全・インフラ保全",
  "人材・BPO",
  "レンタル・リース・シェア",
  "その他サービス",
] as const;
type IndustryLarge = (typeof INDUSTRY_LARGE)[number];

const INDUSTRY_CATEGORIES: Record<IndustryLarge, readonly string[]> = {
  農林水産: ["農業", "畜産", "園芸", "林業", "水産業", "水産加工"],
  "鉱業・採石": ["鉱業", "採石業", "砂利・土石採取"],
  建設: [
    "総合工事",
    "土木工事",
    "建築工事",
    "建築設計",
    "測量・地質調査",
    "内装仕上げ",
    "電気工事",
    "管工事・空調",
    "設備工事",
    "解体工事",
    "リフォーム",
  ],
  "製造（食品・生活）": [
    "食料品製造",
    "飲料・酒類",
    "たばこ",
    "飼料",
    "繊維工業",
    "衣服・アパレル",
    "皮革・靴",
    "木材・木製品",
    "家具・装備品",
    "紙・パルプ",
    "印刷・製本",
    "ゴム製品",
    "プラスチック製品",
  ],
  "製造（素材・化学・資源）": [
    "化学工業",
    "医薬品",
    "化粧品・トイレタリー",
    "石油製品",
    "石炭製品",
    "窯業・土石",
    "セメント",
    "ガラス・ガラス製品",
    "鉄鋼",
    "非鉄金属",
    "金属製品",
  ],
  "製造（機械・電機・輸送）": [
    "一般機械",
    "産業機械",
    "ロボット",
    "電気機械",
    "電子部品・半導体",
    "情報通信機器",
    "精密機器",
    "計測機器",
    "医療機器",
    "輸送用機器（自動車・航空機・造船）",
    "自動車部品",
    "その他製造",
  ],
  "エネルギー・公益": [
    "電力",
    "ガス",
    "熱供給",
    "水道",
    "再生可能エネルギー",
    "エネルギー商社",
    "送配電",
    "プラントエンジ",
  ],
  "情報通信・メディア": [
    "ソフトウェア",
    "受託開発・SI",
    "SaaS",
    "クラウド・データセンター",
    "通信（キャリア/ISP）",
    "インターネットサービス",
    "プラットフォーム",
    "コンテンツ制作",
    "アニメ/ゲーム",
    "放送",
    "出版・メディア",
  ],
  "運輸・物流・郵便": [
    "鉄道",
    "バス・タクシー",
    "道路貨物（トラック）",
    "倉庫",
    "物流・3PL",
    "宅配・ラストマイル",
    "海運",
    "空運",
    "フォワーダー",
    "郵便",
  ],
  卸売: [
    "総合商社",
    "専門商社",
    "機械器具卸",
    "化学品卸",
    "建材・金物卸",
    "食品・飲料卸",
    "繊維・衣料卸",
    "医薬品卸",
    "自動車・部品卸",
    "IT機器卸",
    "その他卸",
  ],
  小売: [
    "百貨店・総合小売",
    "スーパーマーケット",
    "コンビニ",
    "ドラッグストア",
    "専門小売（家電・家具・衣料・スポーツ・書籍）",
    "ホームセンター",
    "EC・ネット通販",
    "自動車小売",
    "リユース・リサイクルショップ",
  ],
  "金融・保険・不動産": [
    "銀行",
    "信金・信組",
    "証券",
    "投資・VC/PE",
    "リース・クレジット",
    "決済・フィンテック",
    "保険（生保・損保・代理店）",
    "不動産開発",
    "不動産仲介",
    "不動産管理・PM",
    "駐車場",
    "REIT",
  ],
  "専門サービス・士業": [
    "法律（弁護士）",
    "会計（公認会計士/税理士）",
    "社労士",
    "司法書士・行政書士",
    "コンサル（戦略/IT/業務）",
    "監査・アドバイザリー",
    "調査・リサーチ",
    "翻訳・通訳",
    "デザイン・クリエイティブ",
    "広告代理店",
    "PR・ブランディング",
    "イベント・展示会",
  ],
  "宿泊・飲食": [
    "ホテル・旅館",
    "民泊・簡易宿所",
    "飲食店（レストラン・カフェ・バー）",
    "フードデリバリー/ケータリング",
  ],
  "生活関連・娯楽・スポーツ": [
    "理美容・エステ",
    "クリーニング",
    "旅行業",
    "冠婚葬祭",
    "スポーツ・フィットネス",
    "娯楽・アミューズメント",
    "テーマパーク",
    "ペット関連",
  ],
  "教育・学習支援": [
    "学校教育",
    "幼稚園・保育園",
    "学習塾・予備校",
    "語学・カルチャー",
    "企業研修・人材育成",
    "オンライン教育",
  ],
  "医療・福祉": [
    "病院・クリニック",
    "歯科",
    "調剤薬局",
    "介護・福祉施設",
    "訪問看護・介護",
    "医療系サービス",
    "保育",
  ],
  "公務・団体・NPO": [
    "官公庁・自治体",
    "独立行政法人",
    "公社・公団",
    "業界団体・組合",
    "国際機関",
    "NPO/NGO",
    "公益法人",
  ],
  "環境・安全・インフラ保全": [
    "廃棄物処理・リサイクル",
    "環境コンサル/計測",
    "ビルメンテナンス",
    "清掃・警備",
    "設備保全",
    "インフラ保全",
  ],
  "人材・BPO": [
    "人材紹介",
    "人材派遣",
    "求人媒体・HRテック",
    "BPO/アウトソーシング",
    "コールセンター",
    "SES",
  ],
  "レンタル・リース・シェア": [
    "レンタル（機器・車両・スペース）",
    "カーシェア/モビリティ",
    "シェアオフィス/スペース",
    "レンタルスペース",
  ],
  その他サービス: [
    "写真・映像",
    "印刷サービス",
    "修理・メンテナンス",
    "配管・水回り",
    "ハウスクリーニング",
    "その他サービス",
  ],
} as const;

const SMALL_TO_LARGE = (() => {
  const map = new Map<string, IndustryLarge>();
  (INDUSTRY_LARGE as readonly IndustryLarge[]).forEach((lg) => {
    (INDUSTRY_CATEGORIES[lg] || []).forEach((sm) => map.set(sm, lg));
  });
  return map;
})();

const ALLOWED_SMALL = Array.from(SMALL_TO_LARGE.keys());

/** =========================
 * 住所→都道府県抽出
 * ========================= */
const PREFS = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];
function extractPrefectures(addr?: string | null): string[] | null {
  if (!addr) return null;
  const a = String(addr);
  const hit = PREFS.find((p) => a.includes(p));
  return hit ? [hit] : null;
}

/** =========================
 * HTTP helpers（タイムアウト短め）
 * ========================= */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari";
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 6000
) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        "user-agent": UA,
        "accept-language": "ja-JP,ja;q=0.9",
        ...(init?.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

/** =========================
 * 文字列抽出
 * ========================= */
function htmlToText(html: string): string {
  return (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}
function extractEmailFromText(s: string): string | null {
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}
function extractMailtoAll(html: string): string[] {
  const out: string[] = [];
  const re = /href=["']mailto:([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const addr = decodeURIComponent((m[1] || "").trim());
    if (addr && /^[^@]+@[^@]+$/.test(addr)) out.push(addr.toLowerCase());
  }
  return Array.from(new Set(out));
}
function extractTelAll(html: string): string[] {
  const out: string[] = [];
  const re = /href=["']tel:([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tel = (m[1] || "").trim().replace(/\s+/g, "");
    if (tel) out.push(tel);
  }
  return Array.from(new Set(out));
}
function extractPhoneJP(s: string): string | null {
  const re =
    /(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|\(0\d{1,4}\)\s?\d{1,4}-\d{3,4}/;
  const m = s.match(re);
  return m ? m[0].replace(/\s+/g, "") : null;
}
function extractEstablishedOn(s: string): string | null {
  const ymd = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(s);
  if (ymd) {
    const y = Number(ymd[1]),
      m = Number(ymd[2]),
      d = Number(ymd[3]);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const ym = /(\d{4})年\s*(\d{1,2})月/.exec(s);
  if (ym) return `${ym[1]}-${String(Number(ym[2])).padStart(2, "0")}-01`;
  const yonly = /(\d{4})年/.exec(s);
  if (yonly) return `${yonly[1]}-01-01`;
  return null;
}
function extractCapitalJPY(s: string): number | null {
  const block = /資本金[^\d]*([\d,\.]+)\s*(億|万)?\s*円/.exec(s);
  if (!block) return null;
  const raw = Number((block[1] || "0").replace(/[^\d\.]/g, ""));
  const unit = block[2] || "";
  if (unit === "億") return Math.round(raw * 100_000_000);
  if (unit === "万") return Math.round(raw * 10_000);
  return Math.round(raw);
}

/** =========================
 * URL 正規化/到達性
 * ========================= */
function originOf(u: string): string | null {
  try {
    const url = new URL(u);
    const proto = url.protocol === "http:" || url.protocol === "https:";
    if (!proto) return null;
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return null;
  }
}
const DDG = ["https://html.duckduckgo.com/html/?q="];
const BAD_DOMAINS = [
  "nta.go.jp",
  "houjin-bangou.nta.go.jp",
  "ja.wikipedia.org",
  "maps.google",
  "goo.ne.jp",
  "yahoo.co.jp",
  "biz-journal",
  "list-company",
  "corporation-list",
  "jpnumber",
  "mynavi",
  "rikunabi",
  "indeed",
  "en-japan",
];
function hostname(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function looksLikeCorpSite(u: string): boolean {
  try {
    const h = hostname(u);
    if (!h) return false;
    if (BAD_DOMAINS.some((x) => h.includes(x))) return false;
    return /\.(co\.jp|jp|com|net|biz|io)$/i.test(h);
  } catch {
    return false;
  }
}
async function ddgGuessHomepage(
  company: string,
  addr?: string | null,
  timeoutMs = 5000
): Promise<string | null> {
  const queries = [
    `${company} ${addr || ""} 公式`,
    `${company} ${addr || ""}`,
    `${company} 公式`,
  ];
  for (const q0 of queries) {
    const q = encodeURIComponent(q0.trim());
    for (const base of DDG) {
      try {
        const r = await fetchWithTimeout(base + q, {}, timeoutMs);
        if (!r.ok) continue;
        const html = await r.text();
        const links = Array.from(
          html.matchAll(
            /<a[^>]+class=["']result__a["'][^>]+href=["']([^"']+)/gi
          )
        ).map((m) => m[1]);
        const any = Array.from(
          html.matchAll(/href=["'](https?:\/\/[^"']+)/gi)
        ).map((m) => m[1]);
        const candidates = [...links, ...any];
        for (const u of candidates) {
          if (!looksLikeCorpSite(u)) continue;
          const o = originOf(u);
          if (o) return o;
        }
      } catch {}
    }
  }
  return null;
}
async function verifyReachableOrigin(
  maybeOrigin: string,
  budgetMs = 8000
): Promise<{ ok: boolean; finalOrigin?: string | null }> {
  const tried = new Set<string>();
  const queue: string[] = [];

  const baseOrigin = originOf(maybeOrigin) || "";
  if (!baseOrigin) return { ok: false, finalOrigin: null };

  const https = baseOrigin.replace(/^http:\/\//i, "https://");
  const http = baseOrigin.replace(/^https:\/\//i, "http://");
  const withWww = (o: string) =>
    o.replace(/^(https?:\/\/)(?!www\.)/i, "$1www.");

  [https, withWww(https), http, withWww(http)]
    .filter((x, i, a) => x && a.indexOf(x) === i)
    .forEach((x) => queue.push(x));

  const deadline = Date.now() + Math.max(2000, budgetMs);

  while (queue.length && Date.now() < deadline) {
    const o = queue.shift()!;
    if (tried.has(o)) continue;
    tried.add(o);

    try {
      let r = await fetchWithTimeout(o, { method: "HEAD" }, 2500);
      if (r.status === 405 || r.status === 501) {
        r = await fetchWithTimeout(o, { method: "GET" }, 4000);
      }
      if (r.ok || (r.status >= 300 && r.status < 400)) {
        const loc = r.headers.get("location");
        const nextOrigin = loc ? originOf(new URL(loc, o).toString()) : null;
        return { ok: true, finalOrigin: nextOrigin || o };
      }
    } catch {}
  }
  return { ok: false, finalOrigin: null };
}

/** =========================
 * 詳細ページ候補
 * ========================= */
function pickDetailLinks(baseHtml: string, baseUrl: string): string[] {
  const items: string[] = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(baseHtml))) {
    const href = (m[1] || "").trim();
    const text = htmlToText(m[2] || "");
    if (!href) continue;
    if (/^mailto:/i.test(href) || /^tel:/i.test(href)) {
      try {
        const u = new URL(href, baseUrl).toString();
        if (!items.includes(u)) items.push(u);
      } catch {}
      continue;
    }
    if (
      /contact|inquiry|お問い合わせ|問合せ|問合わせ|連絡先|会社概要|about|aboutus|company|企業情報|corporate/i.test(
        text + " " + href
      )
    ) {
      try {
        const u = new URL(href, baseUrl).toString();
        if (!items.includes(u)) items.push(u);
      } catch {}
    }
  }
  [
    "/contact",
    "/inquiry",
    "/about",
    "/aboutus",
    "/company",
    "/corporate",
  ].forEach((p) => {
    try {
      const u = new URL(p, baseUrl).toString();
      if (!items.includes(u)) items.push(u);
    } catch {}
  });
  return items.slice(0, 6);
}

/** =========================
 * 業種判定（モーダル小分類のいずれかを返す）
 * 1) LLM（任意）：OPENAI_API_KEY があれば使用
 * 2) 規則ベースのフォールバック
 * ========================= */
async function classifyIndustrySmallLLM(
  corpus: string
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  const sys =
    'あなたは企業の業種分類アシスタントです。与えられた日本語テキスト（会社HPの概要など）から、次の候補一覧の中から最も適切な『小分類』を1つだけ厳密一致で返してください。返答はJSONのみで、{"small":"<小分類名>"} の形式。候補外の自由語は出さないでください。';
  const choices = ALLOWED_SMALL.join(" | ");
  const user = `候補小分類: ${choices}\n---\n本文:\n${corpus.slice(
    0,
    6000
  )}\n---\n出力は {"small":"<候補から1つ>"} のみ。`;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text: string = j?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    const small = String(parsed?.small || "");
    if (SMALL_TO_LARGE.has(small)) return small;
    return null;
  } catch {
    return null;
  }
}

/** 規則ベースの簡易マッピング（候補は必ず“小分類”に揃える） */
const RULES_SMALL: Array<[RegExp, string]> = [
  // 情報通信・メディア
  [/SaaS|SaaS型|サブスク|SaaSサービス|SaaS事業/i, "SaaS"],
  [/受託開発|SIer|システム開発|基幹|ERP|スクラッチ|DX支援/i, "受託開発・SI"],
  [/ソフトウェア|パッケージ|自社開発ソフト|ミドルウェア/i, "ソフトウェア"],
  [
    /データセンター|クラウド|IaaS|PaaS|ホスティング/i,
    "クラウド・データセンター",
  ],
  [/ISP|回線|キャリア|通信事業|MVNO/i, "通信（キャリア/ISP）"],
  [/プラットフォーム|マーケットプレイス|マッチングサイト/i, "プラットフォーム"],
  [/映像制作|動画制作|編集|3DCG|番組制作|コンテンツ制作/i, "コンテンツ制作"],
  [/ゲーム|アニメ|e-?sports/i, "アニメ/ゲーム"],
  [/出版社|出版|新聞|雑誌|メディア運営|Webメディア/i, "出版・メディア"],
  [/放送局|テレビ局|ラジオ局|放送/i, "放送"],
  [
    /インターネットサービス|ウェブサービス|Webサービス|ポータル/i,
    "インターネットサービス",
  ],

  // 人材・BPO
  [/人材紹介|紹介予定派遣|ヘッドハンティング|エージェント/i, "人材紹介"],
  [/人材派遣|労働者派遣|派遣会社|派遣スタッフ/i, "人材派遣"],
  [/求人媒体|採用媒体|ジョブボード|ATS|HRテック/i, "求人媒体・HRテック"],
  [
    /アウトソーシング|BPO|バックオフィス代行|業務代行|受電|架電|事務代行/i,
    "BPO/アウトソーシング",
  ],
  [/コールセンター|コンタクトセンター|テレマーケティング/i, "コールセンター"],
  [/SES|常駐開発|客先常駐/i, "SES"],

  // 専門サービス・士業
  [
    /戦略コンサル|業務改善|BPR|PMO|ITコンサル|DXコンサル/i,
    "コンサル（戦略/IT/業務）",
  ],
  [/監査|アドバイザリー|FAS|デューデリジェンス/i, "監査・アドバイザリー"],
  [/法律|弁護士法人|リーガル|訴訟|法務/i, "法律（弁護士）"],
  [/会計|税理士|公認会計士|記帳|決算|申告/i, "会計（公認会計士/税理士）"],
  [/社労士|社会保険労務士|労務相談/i, "社労士"],
  [/司法書士|行政書士|登記|許認可/i, "司法書士・行政書士"],
  [/リサーチ|市場調査|アンケート|与信調査/i, "調査・リサーチ"],
  [/翻訳|通訳|ローカライズ/i, "翻訳・通訳"],
  [
    /広告代理店|広告運用|運用型広告|メディアバイイング|クリエイティブ制作|マーケティング支援/i,
    "広告代理店",
  ],
  [
    /PR|パブリックリレーションズ|ブランディング|広報代行/i,
    "PR・ブランディング",
  ],
  [/イベント|展示会|カンファレンス|EXPO|運営代行/i, "イベント・展示会"],
  [
    /デザイン|ブランディング|UI\/UX|Webデザイン|グラフィック/i,
    "デザイン・クリエイティブ",
  ],

  // 教育
  [/学習塾|予備校|受験|個別指導/i, "学習塾・予備校"],
  [/語学|英会話|カルチャー|スクール/i, "語学・カルチャー"],
  [/研修|人材育成|社内研修|リスキリング/i, "企業研修・人材育成"],
  [/オンライン学習|e-?learning|LMS/i, "オンライン教育"],
  [/学校|大学|高等学校|小学校|中学校|専門学校/i, "学校教育"],
  [/幼稚園|保育園|認定こども園/i, "幼稚園・保育園"],

  // 医療・福祉
  [/病院|クリニック|診療所|医療法人/i, "病院・クリニック"],
  [/歯科|デンタル/i, "歯科"],
  [/調剤薬局|ドラッグストア併設薬局/i, "調剤薬局"],
  [/介護施設|特養|老健|デイサービス|グループホーム/i, "介護・福祉施設"],
  [/訪問看護|訪問介護|訪問リハビリ/i, "訪問看護・介護"],
  [/医療機器販売|医療関連サービス/i, "医療系サービス"],
  [/保育園運営|保育サービス/i, "保育"],

  // 物流
  [/倉庫|保管|ピッキング|在庫管理|センター運営/i, "倉庫"],
  [/3PL|フルフィルメント|物流アウトソーシング/i, "物流・3PL"],
  [/宅配|ラストマイル|配達|配送網/i, "宅配・ラストマイル"],
  [/フォワーダー|通関|貿易実務/i, "フォワーダー"],
  [/鉄道|バス|タクシー|交通局/i, "鉄道"],
  [/トラック|貨物|運送|陸送|チャーター/i, "道路貨物（トラック）"],
  [/海運|船舶|港湾/i, "海運"],
  [/空運|航空貨物|エアカーゴ/i, "空運"],
  [/郵便|郵便局/i, "郵便"],

  // 小売・卸
  [/総合商社|トレーディングカンパニー/i, "総合商社"],
  [/専門商社|○○商事|○○商社/i, "専門商社"],
  [/家電量販|百貨店|GMS|量販店|大型小売/i, "百貨店・総合小売"],
  [/スーパー|スーパーマーケット/i, "スーパーマーケット"],
  [/コンビニ/i, "コンビニ"],
  [/ドラッグストア/i, "ドラッグストア"],
  [/EC|ネット通販|オンラインストア|モール/i, "EC・ネット通販"],
  [/ホームセンター|DIY|資材小売/i, "ホームセンター"],
  [/リユース|中古買取|リサイクルショップ/i, "リユース・リサイクルショップ"],

  // 金融・不動産
  [/銀行|地銀|メガバンク/i, "銀行"],
  [/信金|信用金庫|信組|信用組合/i, "信金・信組"],
  [/証券|証券会社|投資銀行/i, "証券"],
  [/投資|VC|ベンチャーキャピタル|PEファンド/i, "投資・VC/PE"],
  [/リース|ファイナンス|クレジット/i, "リース・クレジット"],
  [/決済|フィンテック|ペイメント|QRコード決済/i, "決済・フィンテック"],
  [/保険代理店|保険募集人|生保|損保/i, "保険（生保・損保・代理店）"],
  [/不動産開発|ディベロッパー/i, "不動産開発"],
  [/不動産仲介|売買仲介|賃貸仲介|仲介業/i, "不動産仲介"],
  [/プロパティマネジメント|PM|ビル管理|賃貸管理/i, "不動産管理・PM"],
  [/駐車場運営|コインパーキング/i, "駐車場"],
  [/REIT|不動産投資信託/i, "REIT"],

  // 宿泊・飲食
  [/ホテル|旅館|宿泊|宿泊施設/i, "ホテル・旅館"],
  [/民泊|簡易宿所|Airbnb/i, "民泊・簡易宿所"],
  [
    /レストラン|カフェ|居酒屋|飲食店|フードサービス/i,
    "飲食店（レストラン・カフェ・バー）",
  ],
  [/ケータリング|デリバリー|宅配弁当|配膳/i, "フードデリバリー/ケータリング"],

  // 生活関連・その他
  [/美容室|理容|エステ|サロン/i, "理美容・エステ"],
  [/クリーニング|リネン|洗濯/i, "クリーニング"],
  [/旅行会社|ツアー|トラベル|旅行代理店/i, "旅行業"],
  [/ブライダル|冠婚葬祭|葬祭|互助会/i, "冠婚葬祭"],
  [/フィットネス|スポーツクラブ|ジム/i, "スポーツ・フィットネス"],
  [/アミューズメント|娯楽|ゲームセンター|カラオケ/i, "娯楽・アミューズメント"],
  [/テーマパーク|遊園地/i, "テーマパーク"],
  [/ペット|トリミング|動物病院|ペット用品/i, "ペット関連"],

  // 製造（代表例）
  [/食品製造|食品工場|製菓|製パン|飲料工場/i, "食料品製造"],
  [/化粧品|トイレタリー|日用品/i, "化粧品・トイレタリー"],
  [/医薬品|GMP|製剤|原薬/i, "医薬品"],
  [/金属加工|板金|切削|鋳造/i, "金属製品"],
  [/ロボット|FA|自動化設備/i, "ロボット"],
  [/半導体|電子部品|実装|EMS/i, "電子部品・半導体"],
  [/精密機器|測定器|分析装置/i, "精密機器"],
  [/自動車部品|車載|OEM部品/i, "自動車部品"],
  [/印刷|製本|プリント|DTP/i, "印刷・製本"],

  // 建設
  [/総合建設|ゼネコン|総合工事/i, "総合工事"],
  [/土木|インフラ整備|舗装|橋梁/i, "土木工事"],
  [/建築工事|施工|請負/i, "建築工事"],
  [/設計事務所|建築設計|意匠設計|構造設計/i, "建築設計"],
  [/内装|内装仕上げ|リノベーション/i, "内装仕上げ"],
  [/電気工事|弱電|強電|電設/i, "電気工事"],
  [/管工事|空調|設備工事|給排水/i, "管工事・空調"],

  // エネルギー・環境
  [/太陽光|再生可能エネルギー|風力|バイオマス/i, "再生可能エネルギー"],
  [/送配電|配電|系統|サブステーション/i, "送配電"],
  [/ビルメン|ビルメンテナンス|設備管理/i, "ビルメンテナンス"],
  [/清掃|警備|セキュリティガード/i, "清掃・警備"],
  [/廃棄物|リサイクル|産廃|回収/i, "廃棄物処理・リサイクル"],
];

/** LLM→規則の順で“小分類”を決め、大分類は逆引き */
async function mapToModalIndustry(texts: string[]): Promise<{
  small: string;
  large: IndustryLarge;
}> {
  const blob = texts.join(" ").slice(0, 8000);

  // 1) LLM（任意）
  const viaLLM = await classifyIndustrySmallLLM(blob);
  if (viaLLM && SMALL_TO_LARGE.has(viaLLM)) {
    return { small: viaLLM, large: SMALL_TO_LARGE.get(viaLLM)! };
  }

  // 2) 規則
  for (const [re, small] of RULES_SMALL) {
    if (re.test(blob) && SMALL_TO_LARGE.has(small)) {
      return { small, large: SMALL_TO_LARGE.get(small)! };
    }
  }

  // 3) デフォルト（コンテンツ制作/その他 などに寄せず “その他サービス/その他サービス”）
  const fallback = "その他サービス";
  return { small: fallback, large: "その他サービス" };
}

/** =========================
 * フィルタ適合
 * ========================= */
function passesFilters(
  row: {
    prefectures?: string[] | null;
    capital?: number | null;
    established_on?: string | null;
    industry?: string | null; // 小分類名
    company_name?: string | null;
    website?: string | null;
    textIndex?: string | null;
  },
  filters: Filters | undefined
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!filters) return { ok: true, reasons };

  if (filters.prefectures && filters.prefectures.length) {
    const pset = new Set((row.prefectures || []).filter(Boolean));
    const target = filters.prefectures.some((p) => pset.has(p));
    if (!target) reasons.push("都道府県がフィルタ対象外");
  }

  if (filters.capital_min != null && (row.capital ?? 0) < filters.capital_min) {
    if (row.capital != null) reasons.push("資本金が下限未満");
  }
  if (filters.capital_max != null && (row.capital ?? 0) > filters.capital_max) {
    if (row.capital != null) reasons.push("資本金が上限超過");
  }

  const toDate = (s: string) => new Date(s + "T00:00:00Z").getTime();
  if (filters.established_from && row.established_on) {
    if (toDate(row.established_on) < toDate(filters.established_from)) {
      reasons.push("設立日が範囲より古い");
    }
  }
  if (filters.established_to && row.established_on) {
    if (toDate(row.established_on) > toDate(filters.established_to)) {
      reasons.push("設立日が範囲より新しい");
    }
  }

  if (filters.keywords && filters.keywords.length) {
    const blob = (
      row.textIndex ||
      row.industry ||
      row.company_name ||
      row.website ||
      ""
    ).toLowerCase();
    const hit = filters.keywords.some((k) =>
      blob.includes(String(k || "").toLowerCase())
    );
    if (!hit) reasons.push("キーワードに合致しない");
  }

  // 小分類ベースで適合判定（完全一致 or 部分一致）
  if (filters.industries_small && filters.industries_small.length) {
    const s = (row.industry || "").toLowerCase();
    const hit = filters.industries_small.some((k) =>
      s.includes(String(k || "").toLowerCase())
    );
    if (!hit) reasons.push("業種（小分類）が合致しない");
  } else if (filters.industries_large && filters.industries_large.length) {
    const small = row.industry || "";
    const lg = SMALL_TO_LARGE.get(small as any);
    const hit =
      !!lg &&
      filters.industries_large.some(
        (k) => String(k).toLowerCase() === String(lg).toLowerCase()
      );
    if (!hit) reasons.push("業種（大分類）が合致しない");
  }

  return { ok: reasons.length === 0, reasons };
}

/** =========================
 * メイン処理
 * ========================= */
export async function POST(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId))
      return NextResponse.json(
        { error: "x-tenant-id required (uuid)" },
        { status: 400 }
      );

    const body: any = await req.json().catch(() => ({}));
    const since: string | null =
      typeof body?.since === "string" ? body.since : null;
    const want: number = Math.max(
      1,
      Math.min(2000, Math.floor(Number(body?.want) || 60))
    );
    const filters: Filters | undefined = body?.filters;

    // 全体ソフトタイムアウト（既定45秒）
    const started = Date.now();
    const SOFT_TIMEOUT_MS = Math.min(
      Math.max(10000, Number(body?.timeout_ms) || 45000),
      54000
    );
    const timeLeft = () => SOFT_TIMEOUT_MS - (Date.now() - started);
    const timedOut = () => timeLeft() <= 0;

    const { sb } = getAdmin();
    const nowIso = new Date().toISOString();

    // 1) キャッシュ候補取得
    let q = (sb as any)
      .from("nta_corporates_cache")
      .select("corporate_number, company_name, address, scraped_at")
      .eq("tenant_id", tenantId)
      .order("scraped_at", { ascending: false })
      .limit(want * 6);
    if (since) q = q.gte("scraped_at", since);

    const { data: cached, error: cacheErr } = await q;
    if (cacheErr)
      return NextResponse.json({ error: cacheErr.message }, { status: 500 });

    const candidates = Array.isArray(cached) ? cached : [];
    if (candidates.length === 0)
      return NextResponse.json(
        { rows: [], inserted: 0, rejected: [] },
        { status: 200 }
      );

    // 2) 既存prospects / rejected を除外
    const nums = candidates
      .map((c: any) => String(c.corporate_number || ""))
      .filter((v) => /^\d{13}$/.test(v));

    const [{ data: existedPros }, { data: existedRej }] = await Promise.all([
      (sb as any)
        .from("form_prospects")
        .select("corporate_number")
        .eq("tenant_id", tenantId)
        .in("corporate_number", nums),
      (sb as any)
        .from("form_prospects_rejected")
        .select("corporate_number")
        .eq("tenant_id", tenantId)
        .in("corporate_number", nums),
    ]);

    const existedProsSet = new Set<string>(
      (existedPros || []).map((r: any) => String(r.corporate_number))
    );
    const existedRejSet = new Set<string>(
      (existedRej || []).map((r: any) => String(r.corporate_number))
    );

    // 3) HP探索 & 詳細抽出
    const rowsForInsert: any[] = [];
    const rejected: any[] = [];

    const picked = candidates
      .filter(
        (c: any) =>
          !existedProsSet.has(String(c.corporate_number)) &&
          !existedRejSet.has(String(c.corporate_number))
      )
      .slice(0, want * 4);

    for (const c of picked) {
      if (timedOut()) break;

      const corpNo = String(c.corporate_number || "");
      const name = String(c.company_name || "");
      const addr = String(c.address || "");
      const prefs = extractPrefectures(addr);

      // 3-1) HP推定（非AI・ドメイン決定はシステマチック）
      let website: string | null = null;
      try {
        if (timeLeft() > 2000) {
          website = await ddgGuessHomepage(
            name,
            addr,
            Math.min(5000, timeLeft())
          );
        }
      } catch {}

      // 到達性検証 & 正規化
      if (website) {
        const vr = await verifyReachableOrigin(
          website,
          Math.min(8000, timeLeft())
        );
        if (!vr.ok || !vr.finalOrigin) {
          rejected.push({
            tenant_id: tenantId,
            corporate_number: corpNo || null,
            company_name: name,
            website: website,
            contact_email: null,
            phone: null,
            contact_form_url: null,
            industry_large: null,
            industry_small: null,
            company_size: null,
            company_size_extracted: null,
            prefectures: prefs,
            hq_address: addr || null,
            capital: null,
            established_on: null,
            source_site: "nta-crawl",
            reject_reasons: ["公式サイトに到達できない（URL候補は得たがNG）"],
            created_at: nowIso,
            updated_at: nowIso,
          });
          if (rowsForInsert.length + rejected.length >= want) break;
          continue;
        }
        website = vr.finalOrigin;
      }

      if (!website) {
        rejected.push({
          tenant_id: tenantId,
          corporate_number: corpNo || null,
          company_name: name,
          website: null,
          contact_email: null,
          phone: null,
          contact_form_url: null,
          industry_large: null,
          industry_small: null,
          company_size: null,
          company_size_extracted: null,
          prefectures: prefs,
          hq_address: addr || null,
          capital: null,
          established_on: null,
          source_site: "nta-crawl",
          reject_reasons: ["公式サイトが見つからない"],
          created_at: nowIso,
          updated_at: nowIso,
        });
        if (rowsForInsert.length + rejected.length >= want) break;
        continue;
      }

      // 3-2) TOP取得
      let baseHtml = "";
      try {
        const r = await fetchWithTimeout(
          website,
          {},
          Math.min(7000, timeLeft())
        );
        if (r.ok) baseHtml = await r.text();
      } catch {}
      const baseText = htmlToText(baseHtml);

      // mailto / tel
      let email: string | null =
        extractMailtoAll(baseHtml)[0] || extractEmailFromText(baseText);
      let phoneNum: string | null =
        extractTelAll(baseHtml)[0] || extractPhoneJP(baseText);

      // 3-3) 詳細リンク
      const detailLinks = pickDetailLinks(baseHtml, website);

      // 3-4) 詳細抽出（問い合わせURLは到達性チェックも実施）
      let contactFormUrl: string | null = null;
      let est: string | null = extractEstablishedOn(baseText);
      let cap: number | null = extractCapitalJPY(baseText);
      const textCorpus: string[] = [baseText];

      for (const u of detailLinks) {
        if (timedOut()) break;

        try {
          if (/^mailto:/i.test(u)) {
            if (!email)
              email = u
                .replace(/^mailto:/i, "")
                .trim()
                .toLowerCase();
            continue;
          }
          if (/^tel:/i.test(u)) {
            if (!phoneNum) phoneNum = u.replace(/^tel:/i, "").trim();
            continue;
          }

          let okLink = false;
          try {
            const h = await fetchWithTimeout(u, { method: "HEAD" }, 2500);
            okLink = h.ok || (h.status >= 300 && h.status < 400);
          } catch {}
          if (!okLink) {
            try {
              const g = await fetchWithTimeout(u, { method: "GET" }, 4000);
              okLink = g.ok || (g.status >= 300 && g.status < 400);
            } catch {}
          }
          if (!okLink) continue;

          const r = await fetchWithTimeout(u, {}, Math.min(6000, timeLeft()));
          if (!r.ok) continue;
          const html = await r.text();
          const text = htmlToText(html);
          textCorpus.push(text);

          if (
            !contactFormUrl &&
            /問い合わせ|contact|inquiry|フォーム/i.test(text)
          )
            contactFormUrl = u;
          if (!phoneNum)
            phoneNum = extractTelAll(html)[0] || extractPhoneJP(text);
          if (!email)
            email = extractMailtoAll(html)[0] || extractEmailFromText(text);
          if (!est) est = extractEstablishedOn(text);
          if (cap == null) cap = extractCapitalJPY(text);

          if (phoneNum && (email || contactFormUrl) && (est || cap)) break;
        } catch {}
      }

      // 3-5) 業種（モーダル準拠の小分類を返す）
      const indMap = await mapToModalIndustry(textCorpus);

      // 3-6) フィルタ適合
      const { ok, reasons } = passesFilters(
        {
          prefectures: prefs,
          capital: cap,
          established_on: est || null,
          industry: indMap.small, // 小分類名
          company_name: name,
          website,
          textIndex: textCorpus.join(" ").slice(0, 2000),
        },
        filters
      );

      if (!ok) {
        rejected.push({
          tenant_id: tenantId,
          corporate_number: corpNo || null,
          company_name: name,
          website,
          contact_email: email,
          phone: phoneNum,
          contact_form_url: contactFormUrl,
          industry_large: indMap.large,
          industry_small: indMap.small,
          company_size: null,
          company_size_extracted: null,
          prefectures: prefs,
          hq_address: addr || null,
          capital: cap,
          established_on: est,
          source_site: "nta-crawl",
          reject_reasons: reasons.length ? reasons : ["フィルタに不適合"],
          created_at: nowIso,
          updated_at: nowIso,
        });
        if (rowsForInsert.length + rejected.length >= want) break;
        continue;
      }

      // 3-7) prospects upsert
      rowsForInsert.push({
        tenant_id: tenantId,
        company_name: name || null,
        website: website || null,
        contact_form_url: contactFormUrl || null,
        contact_email: email || null,
        phone_number: phoneNum || null,
        phone: phoneNum || null,
        industry: indMap.small || null, // ← 小分類名を保存（UIのモーダルと一致）
        company_size: null,
        job_site_source: "nta-crawl",
        status: "new",
        created_at: nowIso,
        updated_at: nowIso,
        prefectures: prefs,
        corporate_number: corpNo || null,
        hq_address: addr || null,
        capital: cap,
        established_on: est,
      });

      if (rowsForInsert.length + rejected.length >= want) break;
    }

    // 4) DB保存（prospects）
    let rows: ProspectRow[] = [];
    let inserted = 0;
    if (rowsForInsert.length) {
      const ins = await (sb as any)
        .from("form_prospects")
        .upsert(rowsForInsert, {
          onConflict: "tenant_id,corporate_number",
          ignoreDuplicates: true,
        })
        .select(
          "id,tenant_id,company_name,website,contact_form_url,contact_email,phone_number,phone,industry,company_size,job_site_source,status,created_at,updated_at,prefectures,corporate_number,hq_address,capital,established_on"
        );

      if (ins.error) {
        if (/no unique|ON CONFLICT/i.test(ins.error.message || "")) {
          const ins2 = await (sb as any)
            .from("form_prospects")
            .insert(rowsForInsert)
            .select(
              "id,tenant_id,company_name,website,contact_form_url,contact_email,phone_number,phone,industry,company_size,job_site_source,status,created_at,updated_at,prefectures,corporate_number,hq_address,capital,established_on"
            );
          if (ins2.error)
            return NextResponse.json(
              { error: ins2.error.message },
              { status: 500 }
            );
          rows = Array.isArray(ins2.data) ? ins2.data : [];
          inserted = rows.length;
        } else {
          return NextResponse.json(
            { error: ins.error.message },
            { status: 500 }
          );
        }
      } else {
        rows = Array.isArray(ins.data) ? ins.data : [];
        inserted = rows.length;
      }
    }

    // 5) DB保存（rejected）
    let rejected_saved = 0;
    if (rejected.length) {
      const tryUpsertRejected = async () => {
        const { data, error } = await (sb as any)
          .from("form_prospects_rejected")
          .upsert(rejected, {
            onConflict: "tenant_id,corporate_number",
            ignoreDuplicates: true,
          })
          .select("corporate_number");
        return { data, error };
      };

      let { data: rdata, error: rerr } = await tryUpsertRejected();

      if (rerr && /no unique|ON CONFLICT/i.test(rerr.message || "")) {
        const insr = await (sb as any)
          .from("form_prospects_rejected")
          .insert(rejected)
          .select("corporate_number");
        rdata = insr.data;
        rerr = insr.error;
      }

      if (rerr) {
        return NextResponse.json(
          {
            error: rerr.message,
            rows,
            inserted,
            rejected_attempted: rejected.length,
          },
          { status: 500 }
        );
      }

      rejected_saved = Array.isArray(rdata) ? rdata.length : 0;
    }

    return NextResponse.json(
      {
        rows,
        inserted,
        rejected,
        rejected_saved,
        processed_total: rowsForInsert.length + rejected.length,
        want,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
