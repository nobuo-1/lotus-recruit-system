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

/** /job-boards/manual 画面側のテーブル1行分と合わせた型 */
export type ManualFetchRow = {
  site_key: string;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};
