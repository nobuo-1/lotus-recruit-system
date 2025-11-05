// web/src/app/api/job-boards/manual/route.ts
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReqBody = {
  sites: string[];
  doJobs?: boolean;
  doCandidates?: boolean;
};

type Row = {
  site_key: string;
  jobs_count: number | null;
  candidates_count: number | null;
  fetched_at: string;
  note?: string;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 12000
) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/118 Safari/537.36",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

async function getJobsCount_doda(): Promise<number | null> {
  try {
    const r = await fetchWithTimeout(
      "https://doda.jp/DodaFront/View/JobSearchList.action",
      {},
      12000
    );
    if (!r.ok) return null;
    const html = await r.text();
    // 例: <p class="resultNum">該当求人数 <strong>12,345</strong>件</p> などを想定
    const m = html.match(/求人数[^0-9]*([\d,]+)\s*件/);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  } catch {
    return null;
  }
}

async function getJobsCount_mynavi(): Promise<number | null> {
  try {
    const r = await fetchWithTimeout(
      "https://tenshoku.mynavi.jp/list/",
      {},
      12000
    );
    if (!r.ok) return null;
    const html = await r.text();
    // 例: <span class="js__searchCount">12,345件</span>
    const m = html.match(/([\d,]+)\s*件/);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  } catch {
    return null;
  }
}

// 候補者数は各社マイページなど要ログインが前提。ここではログイン設定がある場合にのみ実装を呼ぶ想定。
async function getCandidatesCount(site_key: string): Promise<number | null> {
  // TODO: ログイン＋スクレイピング/公式API。ここでは未実装で null を返します。
  return null;
}

export async function POST(req: Request) {
  try {
    const body: ReqBody = await req.json().catch(() => ({ sites: [] }));
    const sites = Array.isArray(body.sites) ? body.sites : [];
    const doJobs = !!body.doJobs;
    const doCandidates = !!body.doCandidates;

    if (!sites.length) return NextResponse.json({ rows: [] });

    const out: Row[] = [];
    for (const key of sites) {
      let jobs: number | null = null;
      let candidates: number | null = null;
      let note: string | undefined;

      if (doJobs) {
        if (key === "doda") jobs = await getJobsCount_doda();
        else if (key === "mynavi") jobs = await getJobsCount_mynavi();
        else jobs = null; // 他サイトは未実装（拡張ポイント）
        if (jobs == null) note = "求人件数の取得に失敗";
      }

      if (doCandidates) {
        candidates = await getCandidatesCount(key);
        if (candidates == null)
          note =
            (note ? note + " / " : "") + "候補者数はログイン未設定 or 未実装";
      }

      out.push({
        site_key: key,
        jobs_count: jobs,
        candidates_count: candidates,
        fetched_at: new Date().toISOString(),
        note,
      });
    }

    return NextResponse.json({ rows: out });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
