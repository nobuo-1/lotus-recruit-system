import type { ManualCondition, SiteKey } from "./types";
import type { MynaviLoginSession } from "./mynaviLogin";
import {
  loadJobBoardLoginCredentials,
  type JobBoardLoginCredentials,
} from "./loginCredentials";
import { fetchCandidateCountViaLoggedInBrowser } from "./candidatePlaywright";

export type CandidateCountResult = {
  siteKey: SiteKey;
  url: string | null;
  total: number | null;
  httpStatus?: number | null;
  parseHint?: string | null;
  errorMessage?: string | null;
};

export type CandidateFetchContext = {
  mynaviSession?: MynaviLoginSession | null;
  mynaviDebugLogs?: string[];
  loginCredentials?: Partial<Record<SiteKey, JobBoardLoginCredentials | null>>;
};

export async function fetchCandidateCountForCondition(
  cond: ManualCondition,
  context: CandidateFetchContext = {}
): Promise<CandidateCountResult> {
  return fetchCandidateCountFromUrl(cond.siteKey, null, context, cond);
}

export async function fetchCandidateCountFromUrl(
  siteKey: SiteKey,
  url: string | null,
  context: CandidateFetchContext = {},
  cond?: ManualCondition
): Promise<CandidateCountResult> {
  if (!context.loginCredentials) context.loginCredentials = {};
  if (!(siteKey in context.loginCredentials)) {
    context.loginCredentials[siteKey] = await loadJobBoardLoginCredentials(siteKey);
  }

  const credentials = context.loginCredentials[siteKey] ?? null;
  if (!credentials) {
    return {
      siteKey,
      url,
      total: null,
      errorMessage:
        "/job-boards/logins にログイン情報が登録されていません。",
    };
  }

  if (siteKey === "doda") {
    return {
      siteKey,
      url,
      total: null,
      errorMessage: "Dodaの求職者数取得は一旦ステイです。",
    };
  }

  if (siteKey === "mynavi" || siteKey === "type" || siteKey === "womantype") {
    const result = await fetchCandidateCountViaLoggedInBrowser({
      cond: cond ?? {
        siteKey,
        internalLarge: null,
        internalSmall: null,
        prefecture: null,
      },
      credentials,
      startUrl: url,
    });
    return {
      siteKey,
      url: result.url,
      total: result.total,
      httpStatus: null,
      parseHint: result.parseHint,
      errorMessage: result.errorMessage,
    };
  }

  return {
    siteKey,
    url,
    total: null,
    errorMessage: "この媒体の求職者数取得には未対応です。",
  };
}
