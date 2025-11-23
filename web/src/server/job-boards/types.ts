// web/src/server/job-boards/types.ts

/** 転職サイトキー */
export type SiteKey = "mynavi" | "doda" | "type" | "womantype";

/** 1件の検索条件（1行分） */
export type ManualCondition = {
  siteKey: SiteKey;
  internalLarge: string | null;
  internalSmall: string | null;
  prefecture: string | null;
};

/** API から返す 1 行分（条件ごと） */
export type ManualResultRow = {
  site_key: string;
  internal_large: string | null;
  internal_small: string | null;
  prefecture: string | null;
  jobs_total: number | null;
};
