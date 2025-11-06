// web/src/app/api/job-boards/manual/run-batch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type SiteKey = "mynavi" | "doda" | "type" | "womantype";

type RunBody = {
  sites?: SiteKey[];
  large?: string[];
  small?: string[];
  age?: string[];
  emp?: string[];
  sal?: string[];
  pref?: string[];
  want?: number;
  saveMode?: "counts" | "history";
  tenant_id?: string; // フォールバック受け皿（使うのはUUID時のみ）
};

type PreviewRow = {
  site_key: SiteKey;
  site_category_code: string | null;
  site_category_label: string | null;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
  note?: string | null;
};

// ---------- helpers ----------
function isValidUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function getTenantIdFromReq(req: Request, body?: any): string | null {
  const h = (req.headers.get("x-tenant-id") || "").trim();
  if (isValidUuid(h)) return h;
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i);
  if (m && isValidUuid(decodeURIComponent(m[2])))
    return decodeURIComponent(m[2]);
  if (isValidUuid(body?.tenant_id)) return String(body.tenant_id);
  return null;
}

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
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119 Safari/537.36",
        "accept-language": "ja,en;q=0.9",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

async function readTextSafe(
  url: string,
  init: RequestInit = {},
  ms = 12000
): Promise<string> {
  try {
    const r = await fetchWithTimeout(url, init, ms);
    if (!r.ok) return "";
    return await r.text();
  } catch {
    return "";
  }
}

function parseAnyCount(html: string, extraHints: RegExp[] = []): number | null {
  if (!html) return null;
  // よくある「12,345件」「該当求人数 12,345 件」等を拾う
  const patterns: RegExp[] = [
    /該当求人数[^\d]*([\d,]+)\s*件/,
    /求人数[^\d]*([\d,]+)\s*件/,
    /([\d,]+)\s*件(?!数)/,
    /総?数[^\d]*([\d,]+)\b/,
    ...extraHints,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** 可能な範囲でフィルタをキーワード化（サイトが理解できる最低限の文字列） */
function filtersToKeywords(args: {
  internal_large: string | null;
  internal_small: string | null;
  prefecture: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
}) {
  const xs = [
    args.internal_small,
    args.internal_large,
    args.prefecture,
    args.age_band,
    args.employment_type,
    args.salary_band,
  ].filter(Boolean) as string[];
  return xs.join(" ");
}

// ---------- adapters（サイトごとの実装） ----------
type AdapterArgs = {
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  tenant_id: string | null;
  // 認証情報（job_board_logins）をサイト毎に参照用
  login?: { username: string; password: string } | null;
};

type SiteAdapter = {
  jobsCount: (a: AdapterArgs) => Promise<number | null>;
  candidatesCount?: (a: AdapterArgs) => Promise<number | null>;
};

// --- マイナビ
const adapter_mynavi: SiteAdapter = {
  async jobsCount(a) {
    const kw = encodeURIComponent(filtersToKeywords(a));
    const url =
      kw.trim().length > 0
        ? `https://tenshoku.mynavi.jp/list/?keyword=${kw}`
        : `https://tenshoku.mynavi.jp/list/`;
    const html = await readTextSafe(url, {}, 12000);
    return (
      parseAnyCount(html, [
        /class="js__searchCount"[^>]*>\s*([\d,]+)\s*件/,
        /検索結果[^<]*<[^>]*>\s*([\d,]+)\s*件/,
      ]) ?? null
    );
  },
};

// --- doda（求人件数は一般検索、求職者数は dodaダイレクト）
const adapter_doda: SiteAdapter = {
  async jobsCount(a) {
    const kw = encodeURIComponent(filtersToKeywords(a));
    const url =
      kw.trim().length > 0
        ? `https://doda.jp/DodaFront/View/JobSearchList.action?keyword=${kw}`
        : `https://doda.jp/DodaFront/View/JobSearchList.action`;
    const html = await readTextSafe(url, {}, 12000);
    return (
      parseAnyCount(html, [
        /class="resultNum"[^>]*>\s*[^<]*<strong>\s*([\d,]+)\s*<\/strong>\s*件/i,
        /該当求人数[^<]*<[^>]*>\s*([\d,]+)\s*件/,
      ]) ?? null
    );
  },

  /** dodaダイレクト（Recruiter向け）想定のログイン→一覧件数抽出（失敗は null） */
  async candidatesCount(a) {
    if (!a.login) return null;
    try {
      // 1) ログインページへ（クッキー＆CSRF取得ベストエフォート）
      const loginPage = await fetchWithTimeout("https://direct.doda.jp/", {
        method: "GET",
      });
      const cookie = loginPage.headers.get("set-cookie") || "";

      const loginHtml = await loginPage.text().catch(() => "");
      const csrf =
        loginHtml.match(
          /name="authenticity_token"[^>]*value="([^"]+)"/i
        )?.[1] || "";

      // 2) ログインPOST（フォーム名は変化しうるため代表的なキーで試行）
      const form = new URLSearchParams();
      form.set("user[email]", a.login.username);
      form.set("user[password]", a.login.password);
      if (csrf) form.set("authenticity_token", csrf);

      const loginResp = await fetchWithTimeout(
        "https://direct.doda.jp/users/sign_in",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie,
          },
          body: form.toString(),
          redirect: "manual",
        },
        12000
      );

      const cookie2 = loginResp.headers.get("set-cookie") || "" || cookie || "";

      // 3) 候補者検索（フィルタ→キーワード代替）
      const kw = encodeURIComponent(filtersToKeywords(a));
      const listUrl =
        kw.trim().length > 0
          ? `https://direct.doda.jp/talent/search?keyword=${kw}`
          : `https://direct.doda.jp/talent/search`;

      const listHtml = await readTextSafe(
        listUrl,
        { headers: { cookie: cookie2 } },
        12000
      );

      const cnt =
        parseAnyCount(listHtml, [
          /候補者数[^\d]*([\d,]+)\s*件/,
          /検索結果[^<]*([\d,]+)\s*件/,
        ]) ?? null;

      return cnt;
    } catch {
      return null;
    }
  },
};

// --- type
const adapter_type: SiteAdapter = {
  async jobsCount(a) {
    const kw = encodeURIComponent(filtersToKeywords(a));
    const url =
      kw.trim().length > 0
        ? `https://type.jp/job-list/?kw=${kw}`
        : `https://type.jp/job-list/`;
    const html = await readTextSafe(url, {}, 12000);
    return (
      parseAnyCount(html, [
        /検索結果[^<]*([\d,]+)\s*件/,
        /class="searchCount"[^>]*>\s*([\d,]+)\s*件/,
      ]) ?? null
    );
  },
};

// --- 女の転職type
const adapter_womantype: SiteAdapter = {
  async jobsCount(a) {
    const kw = encodeURIComponent(filtersToKeywords(a));
    const url =
      kw.trim().length > 0
        ? `https://woman-type.jp/job-list/?kw=${kw}`
        : `https://woman-type.jp/job-list/`;
    const html = await readTextSafe(url, {}, 12000);
    return (
      parseAnyCount(html, [
        /検索結果[^<]*([\d,]+)\s*件/,
        /class="searchCount"[^>]*>\s*([\d,]+)\s*件/,
      ]) ?? null
    );
  },
};

const ADAPTERS: Record<SiteKey, SiteAdapter> = {
  mynavi: adapter_mynavi,
  doda: adapter_doda,
  type: adapter_type,
  womantype: adapter_womantype,
};

function cartesian<T>(lists: T[][]): T[][] {
  if (!lists.length) return [[]];
  return lists.reduce<T[][]>(
    (acc, list) =>
      acc
        .map((xs) => list.map((y) => xs.concat([y])))
        .reduce((a, b) => a.concat(b), []),
    [[]]
  );
}

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Supabase service role not configured" },
        { status: 500 }
      );
    }

    const body: RunBody = (await req.json().catch(() => ({}))) as RunBody;
    const tenantId = getTenantIdFromReq(req, body); // UUID or null

    const saveMode: "counts" | "history" =
      body?.saveMode === "history" ? "history" : "counts";

    const sites: SiteKey[] =
      Array.isArray(body?.sites) && body!.sites!.length
        ? (body!.sites as SiteKey[])
        : ["mynavi", "doda", "type", "womantype"];

    const large = Array.isArray(body?.large) ? body!.large! : [];
    const small = Array.isArray(body?.small) ? body!.small! : [];
    const age = Array.isArray(body?.age) ? body!.age! : [];
    const emp = Array.isArray(body?.emp) ? body!.emp! : [];
    const sal = Array.isArray(body?.sal) ? body!.sal! : [];
    const pref = Array.isArray(body?.pref) ? body!.pref! : [];

    const want = Math.max(1, Math.min(500, Number(body?.want) || 50));

    // 組合せ（空配列は null 1件扱い）
    const L = large.length ? large : [null];
    const S = small.length ? small : [null];
    const A = age.length ? age : [null];
    const E = emp.length ? emp : [null];
    const Sa = sal.length ? sal : [null];
    const P = pref.length ? pref : [null];

    const combos = cartesian<string | null>([L, S, A, E, Sa, P]);
    const MAX_PER_SITE = Math.max(1, Math.floor(want / sites.length) || 1);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- ログイン情報を取り出して site->cred にマッピング
    const { data: loginRows } = await admin
      .from("job_board_logins")
      .select("site_key, username, password");

    const loginMap = new Map<string, { username: string; password: string }>();
    (loginRows || []).forEach((r: any) => {
      if (r?.site_key && r?.username && r?.password) {
        loginMap.set(r.site_key, {
          username: r.username,
          password: r.password,
        });
      }
    });

    const preview: PreviewRow[] = [];
    for (const site of sites) {
      const adapter = ADAPTERS[site];
      let count = 0;
      for (const c of combos) {
        if (count >= MAX_PER_SITE) break;
        const [lg, sm, ag, em, sa, pr] = c;

        const args: AdapterArgs = {
          internal_large: lg ?? null,
          internal_small: sm ?? null,
          age_band: ag ?? null,
          employment_type: em ?? null,
          salary_band: sa ?? null,
          prefecture: pr ?? null,
          tenant_id: tenantId,
          login: loginMap.get(site) ?? null,
        };

        // 各件数の取得（例外は握りつぶして null）
        let jobs: number | null = null;
        let cands: number | null = null;
        let note: string | null = null;

        try {
          jobs = await adapter.jobsCount(args);
          if (jobs == null) note = "求人件数の取得に失敗";
        } catch {
          jobs = null;
          note = "求人件数の取得に失敗";
        }

        if (adapter.candidatesCount) {
          try {
            cands = await adapter.candidatesCount(args);
            if (cands == null)
              note = (note ? note + " / " : "") + "候補者数の取得に失敗";
          } catch {
            cands = null;
            note = (note ? note + " / " : "") + "候補者数の取得に失敗";
          }
        } else {
          cands = null; // 未対応サイト
        }

        preview.push({
          site_key: site,
          site_category_code: null,
          site_category_label: null,
          internal_large: args.internal_large,
          internal_small: args.internal_small,
          age_band: args.age_band,
          employment_type: args.employment_type,
          salary_band: args.salary_band,
          prefecture: args.prefecture,
          jobs_count: Number.isFinite(jobs as number) ? (jobs as number) : null,
          candidates_count: Number.isFinite(cands as number)
            ? (cands as number)
            : null,
          note,
        });
        count++;
      }
    }

    const result_id = crypto.randomUUID();

    // 保存
    let saved = 0;
    let history_id: string | null = null;

    if (saveMode === "counts") {
      const rows = preview.map((r) => ({
        result_id,
        site_key: r.site_key,
        site_category_code: r.site_category_code,
        site_category_label: r.site_category_label,
        internal_large: r.internal_large,
        internal_small: r.internal_small,
        age_band: r.age_band,
        employment_type: r.employment_type,
        salary_band: r.salary_band,
        prefecture: r.prefecture,
        jobs_count: r.jobs_count,
        candidates_count: r.candidates_count,
      }));

      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000);
        const { error, data } = await admin
          .from("job_board_counts")
          .insert(chunk)
          .select("id");
        if (error) {
          return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
          );
        }
        saved += data?.length ?? chunk.length;
      }
    } else {
      // 履歴保存時は tenant_id が UUID であることを要求（漏洩防止）
      if (!tenantId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "tenant_id is required (UUID). クッキーまたはヘッダーに x-tenant-id を設定してください。",
          },
          { status: 400 }
        );
      }
      const payload: any = {
        params: {
          sites,
          large,
          small,
          age,
          emp,
          sal,
          pref,
          want,
        },
        results: preview,
        result_count: preview.length,
      };
      // NOT NULL 制約がある可能性に備えて UUID のみ突っ込む
      payload.tenant_id = tenantId;

      const ins = await admin
        .from("job_board_manual_runs")
        .insert(payload)
        .select("id")
        .single();
      if (ins.error) {
        return NextResponse.json(
          { ok: false, error: ins.error.message },
          { status: 500 }
        );
      }
      history_id = ins.data?.id ?? null;
    }

    return NextResponse.json({
      ok: true,
      tenant_id: tenantId,
      result_id,
      saved: saveMode === "counts" ? saved : 0,
      history_id,
      preview,
      note:
        saveMode === "counts"
          ? `保存完了 (${saved} 件)`
          : `履歴として保存しました（${preview.length} 件）`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
