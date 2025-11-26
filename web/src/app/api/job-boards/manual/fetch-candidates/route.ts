// web/src/app/api/job-boards/manual/fetch-candidates/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { SiteKey } from "@/server/job-boards/types";
import { createMynaviLoginSession } from "@/server/job-boards/mynaviLogin";
import { fetchMynaviScoutCount } from "@/server/job-boards/mynaviCandidates";

type RequestBody = {
  /** 現状 "mynavi" 固定で想定 */
  siteKey: SiteKey;
  /**
   * 取得対象のスカウト検索URL
   * 例:
   *  https://tenshoku.mynavi.jp/client/scout/index.cfm?chkcd=...&fuseaction=ctsm_listScoutTarget_form&plan_id=1&contract_id=2&job_seq_no=1&scout_classify_id=7&...
   */
  url: string;
};

function isSupportedSite(siteKey: string): siteKey is SiteKey {
  return siteKey === "mynavi"; // 今はマイナビのみサポート
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    if (!body.siteKey || !isSupportedSite(body.siteKey)) {
      return NextResponse.json(
        {
          ok: false,
          error: "サポートされていないサイトです。（現在はマイナビのみ対応）",
        },
        { status: 400 }
      );
    }

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json(
        { ok: false, error: "取得対象の URL が指定されていません。" },
        { status: 400 }
      );
    }

    // 1. マイナビにログインして Cookie を取得
    const { session, debugLogs: loginLogs } = await createMynaviLoginSession();

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "マイナビへのログインに失敗しました。ログイン情報や reCAPTCHA の状態を確認してください。",
          debugLogs: loginLogs,
        },
        { status: 500 }
      );
    }

    // 2. ログイン済み Cookie を使ってスカウト候補者数を取得
    const result = await fetchMynaviScoutCount(session, body.url);

    const responseBody = {
      ok: true,
      siteKey: body.siteKey,
      url: result.url,
      total: result.total,
      httpStatus: result.httpStatus ?? null,
      parseHint: result.parseHint ?? null,
      errorMessage: result.errorMessage ?? null,
      debugLogs: loginLogs,
    };

    return NextResponse.json(responseBody, { status: 200 });
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
