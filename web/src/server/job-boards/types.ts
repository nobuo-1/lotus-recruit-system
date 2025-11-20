// web/src/server/job-boards/types.ts

/** 転職サイトキー */
export type SiteKey = "mynavi" | "doda" | "type" | "womantype";

/** 1件の検索条件（1行分） */
export type ManualCondition = {
  siteKey: SiteKey;
  internalLarge: string | null;
  internalSmall: string | null;
  prefecture: string | null;
  ageBand: string | null;
  employmentType: string | null;
  salaryBand: string | null;
};

/** 結果表示用：層ごとの件数 */
export type ManualLayerCount = {
  label: string;
  jobs_count: number | null;
};

/** API から返す 1 行分（画面でカード表示） */
export type ManualResultRow = {
  site_key: string;
  internal_large: string | null;
  internal_small: string | null;
  prefecture: string | null;
  jobs_total: number | null;
  age_layers: ManualLayerCount[];
  employment_layers: ManualLayerCount[];
  salary_layers: ManualLayerCount[];
};

/** UI / 集計用：年齢層（表示ラベル用） */
export const AGE_BANDS = [
  { key: "all", label: "すべて" },
  { key: "under-20", label: "20歳以下" },
  { key: "20-24", label: "20〜24歳" },
  { key: "25-29", label: "25〜29歳" },
  { key: "30-34", label: "30〜34歳" },
  { key: "35-39", label: "35〜39歳" },
  { key: "40-44", label: "40〜44歳" },
  { key: "45-49", label: "45〜49歳" },
  { key: "50-54", label: "50〜54歳" },
  { key: "55-59", label: "55〜59歳" },
  { key: "60-64", label: "60〜64歳" },
  { key: "65-plus", label: "65歳以上" },
] as const;

/** UI / 集計用：雇用形態（表示ラベル用） */
export const EMP_TYPES = [
  { key: "all", label: "すべて" },
  { key: "fulltime", label: "正社員" },
  { key: "contract", label: "契約社員" },
  { key: "haken", label: "派遣社員" },
  { key: "part", label: "アルバイト" },
  { key: "outsourcing", label: "業務委託" },
] as const;

/** UI / 集計用：年収帯（表示ラベル用） */
export const SALARY_BANDS = [
  { key: "all", label: "すべて" },
  { key: "lt-300", label: "~300万" },
  { key: "300-400", label: "300~400万" },
  { key: "400-500", label: "400~500万" },
  { key: "500-600", label: "500~600万" },
  { key: "600-800", label: "600~800万" },
  { key: "800-plus", label: "800万~" },
] as const;
