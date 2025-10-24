// web/src/server/scrapers/jobBoards.ts
// MVP: まずはスタブで結果を固定生成。後でPlaywright実装に差し替え。
// 返却は「サイトカテゴリ毎の jobs_count / candidates_count」を内製区分へマッピングした配列。

import { JOB_LARGE, JOB_CATEGORIES } from "@/constants/jobCategories";

export type SiteKey = "mynavi" | "doda" | "type" | "wtype" | "rikunavi" | "en";
type Row = {
  site_category_code: string;
  site_category_label: string;
  internal_large: string;
  internal_small: string;
  jobs_count: number;
  candidates_count?: number | null;
};

function pickSample(): Row[] {
  // 代表的なIT/営業/事務を返すスタブ（後で実スクレイピングに差し替え）
  return [
    {
      site_category_code: "it-web-backend",
      site_category_label: "Web系・バックエンド",
      internal_large: "ITエンジニア",
      internal_small: "バックエンドエンジニア",
      jobs_count: 1234,
      candidates_count: 210,
    },
    {
      site_category_code: "sales-corp",
      site_category_label: "法人営業",
      internal_large: "営業",
      internal_small: "法人営業（新規）",
      jobs_count: 980,
      candidates_count: 150,
    },
    {
      site_category_code: "office-general",
      site_category_label: "一般事務",
      internal_large: "事務・アシスタント",
      internal_small: "一般事務",
      jobs_count: 740,
      candidates_count: 85,
    },
  ];
}

export async function scrapeSite(
  site: SiteKey,
  opts: {
    tenantId: string;
    filters?: {
      location?: string;
      salary?: string;
      employment_type?: string;
      age_band?: string; // "20-24" 等
      last_login_within_days?: number; // 30 等
    };
    // auth は table から取得して渡される想定
    auth?: { login_email?: string; login_password?: string };
  }
): Promise<Row[]> {
  // TODO: Playwright + ログイン/検索条件付与 + ページング集計 + カテゴリマッピング
  // まずはダミーデータで回るように
  await new Promise((r) => setTimeout(r, 300));
  return pickSample();
}
