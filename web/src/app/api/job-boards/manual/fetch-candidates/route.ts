// web/src/app/api/job-boards/manual/fetch-candidates/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { SiteKey } from "@/server/job-boards/types";
import { createMynaviLoginSession } from "@/server/job-boards/mynaviLogin";
import { fetchMynaviScoutCount } from "@/server/job-boards/mynaviCandidates";

type RequestBody = {
  /** 旧来互換: 単一サイト指定 */
  siteKey?: SiteKey;
  /**
   * 取得対象のスカウト検索URL
   * 例:
   *  https://tenshoku.mynavi.jp/client/scout/index.cfm?chkcd=...&fuseaction=ctsm_listScoutTarget_form&plan_id=1&contract_id=2&job_seq_no=1&scout_classify_id=7&...
   */
  url?: string;
  /** 新版: 対象サイトの配列 */
  sites?: SiteKey[];
  /** 新版: サイトごとのスカウト検索URL */
  scoutUrls?: Record<string, string>;
};

type CandidateResult = {
  siteKey: SiteKey;
  url: string | null;
  total: number | null;
  httpStatus?: number | null;
  parseHint?: string | null;
  errorMessage?: string | null;
  debugLogs?: string[];
};

function isValidSiteKey(siteKey: string): siteKey is SiteKey {
  return (
    siteKey === "mynavi" ||
    siteKey === "doda" ||
    siteKey === "type" ||
    siteKey === "womantype"
  );
}

function safeParseCount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return n;
}

function parseCandidateCount(html: string): { count: number | null; hint: string | null } {
  const patterns: Array<{ re: RegExp; hint: string }> = [
    { re: /該当(?:会員|求職者|候補者|人材)[\s　]*([\d,]+)\s*(?:名|人)/g, hint: "text:該当◯◯○名" },
    { re: /条件に合う(?:会員|求職者|候補者)[\s　]*([\d,]+)\s*(?:名|人)/g, hint: "text:条件に合う○名" },
    { re: /(?:求職者|候補者|会員|登録者)[\s　]*([\d,]+)\s*(?:名|人)/g, hint: "text:求職者/候補者/会員" },
    { re: /検索対象[\s　]*([\d,]+)\s*(?:名|人)/g, hint: "text:検索対象○名" },
    { re: /対象(?:人数|者数)?[\s　]*([\d,]+)\s*(?:名|人)/g, hint: "text:対象○名" },
  ];

  let best: number | null = null;
  let bestHint: string | null = null;

  for (const { re, hint } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const n = safeParseCount(m?.[1]);
      if (n == null) continue;
      if (best == null || n > best) {
        best = n;
        bestHint = hint;
      }
    }
  }

  const jsonRe =
    /["']?(?:candidateCount|memberCount|resumeCount|personCount|userCount|targetCount)["']?\s*:\s*([0-9]{1,7})/g;
  let jm: RegExpExecArray | null;
  while ((jm = jsonRe.exec(html)) !== null) {
    const n = safeParseCount(jm?.[1]);
    if (n == null) continue;
    if (best == null || n > best) {
      best = n;
      bestHint = "json:*Count(max)";
    }
  }

  return { count: best, hint: bestHint };
}

async function fetchCandidateCountViaDirectFetch(
  siteKey: SiteKey,
  url: string
): Promise<CandidateResult> {
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const refererMap: Record<SiteKey, string> = {
    mynavi: "https://tenshoku.mynavi.jp/",
    doda: "https://doda.jp/",
    type: "https://type.jp/",
    womantype: "https://woman-type.jp/",
  };

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        referer: refererMap[siteKey],
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const httpStatus = res.status;
    if (!res.ok) {
      return {
        siteKey,
        url,
        total: null,
        httpStatus,
        parseHint: null,
        errorMessage: `fetch failed: ${res.status} ${res.statusText}`,
      };
    }

    const html = await res.text();
    const { count, hint } = parseCandidateCount(html);
    if (count == null) {
      return {
        siteKey,
        url,
        total: null,
        httpStatus,
        parseHint: hint,
        errorMessage: "候補者数をページからパースできませんでした。",
      };
    }

    return {
      siteKey,
      url,
      total: count,
      httpStatus,
      parseHint: hint,
      errorMessage: null,
    };
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "fetch aborted (timeout)"
        : `fetch error: ${err?.message ?? String(err)}`;
    return {
      siteKey,
      url,
      total: null,
      httpStatus: null,
      parseHint: null,
      errorMessage: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const scoutUrls = {
      ...(body.scoutUrls || {}),
    } as Record<string, string>;

    if (body.siteKey && body.url) {
      scoutUrls[body.siteKey] = body.url;
    }

    const sites = Array.isArray(body.sites)
      ? body.sites.filter((s) => isValidSiteKey(s))
      : [];
    if (body.siteKey && isValidSiteKey(body.siteKey)) {
      if (!sites.includes(body.siteKey)) sites.push(body.siteKey);
    }

    if (sites.length === 0) {
      return NextResponse.json(
        { ok: false, error: "取得対象サイトが指定されていません。" },
        { status: 400 }
      );
    }

    const results: CandidateResult[] = [];

    let mynaviSession: Awaited<ReturnType<typeof createMynaviLoginSession>> | null =
      null;

    for (const siteKey of sites) {
      const url = scoutUrls[siteKey];
      if (!url) {
        results.push({
          siteKey,
          url: null,
          total: null,
          errorMessage: "スカウト検索URLが未設定です。",
        });
        continue;
      }

      if (siteKey === "mynavi") {
        if (!mynaviSession) {
          mynaviSession = await createMynaviLoginSession();
        }
        const { session, debugLogs } = mynaviSession;
        if (!session) {
          results.push({
            siteKey,
            url,
            total: null,
            errorMessage:
              "マイナビへのログインに失敗しました。ログイン情報や reCAPTCHA の状態を確認してください。",
            debugLogs,
          });
          continue;
        }

        const result = await fetchMynaviScoutCount(session, url);
        results.push({
          siteKey,
          url: result.url,
          total: result.total,
          httpStatus: result.httpStatus ?? null,
          parseHint: result.parseHint ?? null,
          errorMessage: result.errorMessage ?? null,
          debugLogs,
        });
        continue;
      }

      const direct = await fetchCandidateCountViaDirectFetch(siteKey, url);
      results.push(direct);
    }

    const fetchedCount = results.reduce((sum, r) => {
      const v = typeof r.total === "number" ? r.total : 0;
      return sum + v;
    }, 0);

    return NextResponse.json(
      {
        ok: true,
        results,
        fetchedCount,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("fetch-candidates error", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ? String(e.message) : String(e),
      },
      { status: 500 }
    );
  }
}
