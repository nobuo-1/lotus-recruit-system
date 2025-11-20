// web/src/lib/job-boards/normalize.ts
// サイト別の職種 → LOTUS内の共通職種へ正規化
// 返り値は { large: string | null; small: string | null } を厳守（undefined禁止）

export type NormalizedCategory = { large: string | null; small: string | null };

/** サイト識別子 */
type SiteKey = "doda" | "mynavi" | "type" | "womantype";

/** 内部の大分類（例）— 既存の JOB_LARGE と概ね整合する命名 */
const LARGE = [
  "ITエンジニア",
  "モノづくりエンジニア",
  "建築・土木",
  "医療・介護・福祉",
  "営業",
  "販売・サービス",
  "事務・管理",
  "企画・マーケ",
  "クリエイティブ",
  "コンサル・専門職",
  "金融・不動産",
  "メディカル・化学",
  "運輸・物流",
  "教育・保育",
  "その他",
] as const;
type Large = (typeof LARGE)[number];

/** ラベル正規化（全角・表記揺れ対策） */
function norm(s?: string | null): string {
  if (!s) return "";
  return s
    .replace(/\s+/g, "")
    .replace(/[－―ーｰ]/g, "-")
    .toLowerCase();
}

/** 完全一致辞書（サイト別→内部小分類） */
type MapEntry = { large: Large; small: string };
type Dict = Record<string, MapEntry>;

/** ---------------- doda ----------------
 * 参考: dodaの職種コード一覧（代理店公開の職種コード・名称の網羅リスト）
 */
const DODA: Dict = {
  // ITエンジニア
  "システムエンジニア(se)": { large: "ITエンジニア", small: "SE" },
  "プログラマー(pg)": { large: "ITエンジニア", small: "プログラマー" },
  アプリ開発: { large: "ITエンジニア", small: "アプリ開発" },
  インフラエンジニア: { large: "ITエンジニア", small: "インフラエンジニア" },
  ネットワークエンジニア: { large: "ITエンジニア", small: "ネットワーク" },
  サーバーエンジニア: { large: "ITエンジニア", small: "サーバ" },
  クラウドエンジニア: { large: "ITエンジニア", small: "クラウド" },
  セキュリティエンジニア: { large: "ITエンジニア", small: "セキュリティ" },
  "テスト/qa": { large: "ITエンジニア", small: "テスト/QA" },
  社内se: { large: "ITエンジニア", small: "社内SE" },
  テクニカルサポート: { large: "ITエンジニア", small: "テクサポ/ヘルプデスク" },
  ヘルプデスク: { large: "ITエンジニア", small: "テクサポ/ヘルプデスク" },

  // モノづくり/建築
  電気電子機械エンジニア: { large: "モノづくりエンジニア", small: "電気/機械" },
  生産技術: { large: "モノづくりエンジニア", small: "生産技術" },
  品質保証: { large: "モノづくりエンジニア", small: "品質管理/品質保証" },
  建築土木技術者: { large: "建築・土木", small: "施工管理/設計" },

  // 医療・介護
  看護師: { large: "医療・介護・福祉", small: "看護師" },
  介護福祉士: { large: "医療・介護・福祉", small: "介護" },
  薬剤師: { large: "医療・介護・福祉", small: "薬剤師" },
  医療事務: { large: "医療・介護・福祉", small: "医療事務" },

  // 営業
  法人営業: { large: "営業", small: "法人営業" },
  個人営業: { large: "営業", small: "個人営業" },
  ルート営業: { large: "営業", small: "ルート営業" },
  itソリューション営業: { large: "営業", small: "ITソリューション営業" },

  // 販売・サービス
  販売スタッフ: { large: "販売・サービス", small: "販売スタッフ" },
  店長: { large: "販売・サービス", small: "店舗運営/店長" },
  ホールスタッフ: { large: "販売・サービス", small: "飲食/宿泊" },

  // 事務・管理
  一般事務: { large: "事務・管理", small: "一般事務" },
  営業事務: { large: "事務・管理", small: "営業事務" },
  経理: { large: "事務・管理", small: "経理/財務" },
  人事: { large: "事務・管理", small: "人事/労務" },
  総務: { large: "事務・管理", small: "総務" },
  法務: { large: "事務・管理", small: "法務/知財" },
  広報ir: { large: "事務・管理", small: "広報/IR" },

  // 企画・マーケ
  商品企画: { large: "企画・マーケ", small: "商品/サービス企画" },
  webマーケティング: { large: "企画・マーケ", small: "Web/デジタルマーケ" },
  seo: { large: "企画・マーケ", small: "Web/デジタルマーケ" },
  広告運用: { large: "企画・マーケ", small: "広告運用" },

  // クリエイティブ
  webデザイナー: { large: "クリエイティブ", small: "Webデザイン" },
  "ui/uxデザイナー": { large: "クリエイティブ", small: "UI/UX" },
  編集ライター: { large: "クリエイティブ", small: "編集/ライター" },

  // コンサル・専門職
  戦略コンサルタント: { large: "コンサル・専門職", small: "戦略/業務コンサル" },
  itコンサル: { large: "コンサル・専門職", small: "ITコンサル" },
  会計士: { large: "コンサル・専門職", small: "会計/税務" },

  // 金融・不動産
  ファイナンシャルプランナー: { large: "金融・不動産", small: "個人向け金融" },
  不動産営業: { large: "金融・不動産", small: "不動産営業" },

  // 運輸・物流
  倉庫物流: { large: "運輸・物流", small: "倉庫/物流管理" },
  ドライバー: { large: "運輸・物流", small: "ドライバー" },

  // 教育
  保育士: { large: "教育・保育", small: "保育士" },
  教師講師: { large: "教育・保育", small: "学校/塾講師" },

  /** ===== WEB・インターネット・ゲーム系（今回追加） ===== */

  // WEBサイト・インターネットサービス
  "seoコンサルタント・semコンサルタント": {
    large: "企画・マーケ",
    small: "Web/デジタルマーケ",
  },
  インターネットサービス企画: {
    large: "企画・マーケ",
    small: "商品/サービス企画",
  },
  "webプロデューサー・ディレクター": {
    large: "クリエイティブ",
    small: "Webプロデューサー/ディレクター",
  },
  "情報アーキテクト・ui/uxデザイナー": {
    large: "クリエイティブ",
    small: "UI/UX",
  },
  "システムディレクター・テクニカルディレクター": {
    large: "ITエンジニア",
    small: "システムディレクター",
  },
  "アクセス解析・統計解析": {
    large: "企画・マーケ",
    small: "データ解析/アクセス解析",
  },
  "webコンテンツ企画・制作": {
    large: "クリエイティブ",
    small: "Web/編集/デザイン",
  },
  // webデザイナー は既に上で定義済み
  "フロントエンドエンジニア・コーダー": {
    large: "ITエンジニア",
    small: "フロントエンド/コーダー",
  },
  "プログラマー(webサイト・インターネットサービス系)": {
    large: "ITエンジニア",
    small: "プログラマー",
  },
  "その他webサイト・インターネットサービス関連職": {
    large: "ITエンジニア",
    small: "その他Webサービス",
  },

  // ゲーム・アミューズメント
  "ディレクター・プロデューサー（ゲーム・アミューズメント系)": {
    large: "クリエイティブ",
    small: "ゲームディレクター/プロデューサー",
  },
  "ゲームプランナー・ゲーム企画": {
    large: "クリエイティブ",
    small: "ゲームプランナー",
  },
  シナリオライター: {
    large: "クリエイティブ",
    small: "編集/ライター",
  },
  "グラフィックデザイナー・cgデザイナー・イラストレーター(ゲーム・アミューズメント系)":
    {
      large: "クリエイティブ",
      small: "CG/イラスト",
    },
  "プログラマー(ゲーム・アミューズメント系)": {
    large: "ITエンジニア",
    small: "ゲームプログラマー",
  },
  サウンドクリエイター: {
    large: "クリエイティブ",
    small: "サウンドクリエイター",
  },
  "その他ゲーム・アミューズメント関連職": {
    large: "クリエイティブ",
    small: "その他ゲーム",
  },

  // WEBショップ・ECサイト運営
  "webショップ・ecサイト運営": {
    large: "企画・マーケ",
    small: "EC/ネットショップ運営",
  },
};

/** ---------------- マイナビ転職 ---------------- */
const MYNAVI: Dict = {
  "itエンジニア(se,pg,インフラ)": {
    large: "ITエンジニア",
    small: "SE/PG/インフラ",
  },
  "社内se・テクサポ": { large: "ITエンジニア", small: "社内SE/ヘルプデスク" },
  "機械・電気・電子": { large: "モノづくりエンジニア", small: "電気/機械" },
  "建築・土木・設備": { large: "建築・土木", small: "施工管理/設計" },
  "医療・福祉": { large: "医療・介護・福祉", small: "医療/介護" },
  営業: { large: "営業", small: "営業（総合）" },
  "販売・フード・アミューズメント": {
    large: "販売・サービス",
    small: "販売/接客/飲食",
  },
  "事務・管理": { large: "事務・管理", small: "一般/営業/経理/人事" },
  "企画・経営": { large: "企画・マーケ", small: "企画/事業開発" },
  クリエイティブ: { large: "クリエイティブ", small: "Web/編集/デザイン" },
  "コンサルタント・士業": { large: "コンサル・専門職", small: "コンサル/士業" },
  "運輸・物流・設備": { large: "運輸・物流", small: "運輸/設備" },
  "教育・保育・通訳": { large: "教育・保育", small: "教育/保育" },
};

/** ---------------- type ---------------- */
const TYPE: Dict = {
  // 公式の職種図鑑カテゴリと実サービスの掲載カテゴリを概ね対応付け
  it系エンジニア: { large: "ITエンジニア", small: "ITエンジニア（総合）" },
  webエンジニア: { large: "ITエンジニア", small: "Web/アプリ" },
  インフラエンジニア: { large: "ITエンジニア", small: "インフラ" },
  セキュリティエンジニア: { large: "ITエンジニア", small: "セキュリティ" },
  "テスト/品質": { large: "ITエンジニア", small: "テスト/QA" },
  モノづくり系エンジニア: { large: "モノづくりエンジニア", small: "電気/機械" },
  営業系: { large: "営業", small: "営業（総合）" },
  "販売・サービス系": { large: "販売・サービス", small: "販売/接客" },
  事務系: { large: "事務・管理", small: "一般/営業事務" },
  マーケティング系: { large: "企画・マーケ", small: "マーケ/プロモ" },
  クリエイティブ系: { large: "クリエイティブ", small: "Web/デザイン" },
  コンサル系: { large: "コンサル・専門職", small: "コンサル" },
};

/** ---------------- 女の転職type ---------------- */
const WOMAN_TYPE: Dict = {
  "一般事務・庶務": { large: "事務・管理", small: "一般事務" },
  営業事務: { large: "事務・管理", small: "営業事務" },
  医療事務: { large: "医療・介護・福祉", small: "医療事務" },
  受付: { large: "事務・管理", small: "受付" },
  経理: { large: "事務・管理", small: "経理/財務" },
  人事: { large: "事務・管理", small: "人事/労務" },
  総務: { large: "事務・管理", small: "総務" },
  広報ir: { large: "事務・管理", small: "広報/IR" },
  法務: { large: "事務・管理", small: "法務/知財" },
  "販売・接客": { large: "販売・サービス", small: "販売/接客" },
  "美容・ブライダル": { large: "販売・サービス", small: "美容/ブライダル" },
  保育士: { large: "教育・保育", small: "保育士" },
  看護師: { large: "医療・介護・福祉", small: "看護師" },
  介護: { large: "医療・介護・福祉", small: "介護" },
  webデザイナー: { large: "クリエイティブ", small: "Webデザイン" },
  "編集・ライター": { large: "クリエイティブ", small: "編集/ライター" },
  営業: { large: "営業", small: "営業（総合）" },
};

/** サイト別辞書 */
const SITE_DICT: Record<SiteKey, Dict> = {
  doda: DODA,
  mynavi: MYNAVI,
  type: TYPE,
  womantype: WOMAN_TYPE,
};

/** ざっくり正規表現（辞書にない表記揺れの吸収） */
const FALLBACK_RULES: Array<{ re: RegExp; out: MapEntry }> = [
  // IT
  {
    re: /se|プログラマ|プログラマー|開発|エンジニア|デベロッパ/i,
    out: { large: "ITエンジニア", small: "SE/PG" },
  },
  {
    re: /インフラ|ネットワーク|サーバ|クラウド/i,
    out: { large: "ITエンジニア", small: "インフラ" },
  },
  {
    re: /セキュリティ/i,
    out: { large: "ITエンジニア", small: "セキュリティ" },
  },
  { re: /qa|テスト/i, out: { large: "ITエンジニア", small: "テスト/QA" } },
  {
    re: /社内se|ヘルプデスク|テクニカルサポート|テクサポ/i,
    out: { large: "ITエンジニア", small: "社内SE/ヘルプデスク" },
  },
  // ものづくり/建築
  {
    re: /電気|機械|電子|生産技術|品質/i,
    out: { large: "モノづくりエンジニア", small: "電気/機械" },
  },
  {
    re: /建築|土木|施工管理|設備|設計/i,
    out: { large: "建築・土木", small: "施工管理/設計" },
  },
  // 医療・介護
  {
    re: /看護|保健師|助産師/i,
    out: { large: "医療・介護・福祉", small: "看護師等" },
  },
  {
    re: /介護|ケアマネ|福祉/i,
    out: { large: "医療・介護・福祉", small: "介護/福祉" },
  },
  {
    re: /薬剤師|登録販売者/i,
    out: { large: "医療・介護・福祉", small: "薬剤/登録販売" },
  },
  { re: /医療事務/i, out: { large: "医療・介護・福祉", small: "医療事務" } },
  // 営業/販売
  { re: /営業/i, out: { large: "営業", small: "営業（総合）" } },
  {
    re: /販売|接客|店舗|店長|ホール|ホテル|飲食/i,
    out: { large: "販売・サービス", small: "販売/接客/飲食" },
  },
  // 事務・管理
  {
    re: /一般事務|営業事務|経理|財務|人事|総務|法務|広報|ir|秘書|貿易|英文|受付/i,
    out: { large: "事務・管理", small: "事務/管理" },
  },
  // 企画/マーケ
  {
    re: /マーケ|seo|広告運用|販促|プロモ|商品企画|事業企画/i,
    out: { large: "企画・マーケ", small: "マーケ/企画" },
  },
  // クリエイティブ
  {
    re: /webデザ|ui|ux|編集|ライター|動画|グラフィック/i,
    out: { large: "クリエイティブ", small: "Web/編集/デザイン" },
  },
  // コンサル/専門職
  {
    re: /コンサル|会計士|税理士|弁護士|社労士/i,
    out: { large: "コンサル・専門職", small: "コンサル/士業" },
  },
  // 物流/教育/その他
  {
    re: /物流|倉庫|ドライバー|運輸/i,
    out: { large: "運輸・物流", small: "物流/運輸" },
  },
  { re: /保育|教師|講師/i, out: { large: "教育・保育", small: "教育/保育" } },
];

/** メイン関数：サイトのカテゴリ（ラベル / コード）から内部分類へ */
export function normalizeCategory(
  site_key: string,
  site_category_label?: string | null,
  site_category_code?: string | null
): NormalizedCategory {
  const k = (String(site_key || "").toLowerCase() as SiteKey) || "doda";
  const dict = SITE_DICT[k] || {};
  const lab = norm(site_category_label);
  const cod = norm(site_category_code);

  const tryHit = (x: string): MapEntry | undefined => (x ? dict[x] : undefined);

  // 1) コード完全一致
  let hit = tryHit(cod);
  // 2) ラベル完全一致
  if (!hit) hit = tryHit(lab);

  // 3) 包含（dodaの「ネットワークエンジニア（運用）」等）
  if (!hit && lab) {
    const ent = Object.entries(dict).find(([key]) => lab.includes(key));
    if (ent) hit = ent[1];
  }

  // 4) フォールバック正規表現
  if (!hit) {
    const f = FALLBACK_RULES.find((r) =>
      r.re.test(site_category_label || site_category_code || "")
    );
    if (f) hit = f.out;
  }

  return {
    large: hit?.large ?? null,
    small: hit?.small ?? null,
  };
}
