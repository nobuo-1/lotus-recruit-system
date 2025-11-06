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
  tenant_id?: string; // ← フォールバック用
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
};

/** リクエストから tenant_id を解決（Header → Cookie → Body → "public"） */
function resolveTenantId(req: Request, body?: any): string {
  const h = req.headers.get("x-tenant-id");
  if (h && h.trim()) return h.trim();

  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i);
  if (m) return decodeURIComponent(m[2]);

  if (body?.tenant_id) return String(body.tenant_id);
  return "public";
}

/** 任意のサイトへ問い合わせて件数を返すためのスタブ（実実装に差し替えポイント） */
async function collectCountsForSite(args: {
  site: SiteKey;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
}): Promise<
  Omit<
    PreviewRow,
    "site_key" | "site_category_code" | "site_category_label"
  > & { site_category_code: string | null; site_category_label: string | null }
> {
  // TODO: 実サイトの件数取得。null を許容し、undefined は返さないこと。
  return {
    site_category_code: null,
    site_category_label: null,
    internal_large: args.internal_large,
    internal_small: args.internal_small,
    age_band: args.age_band,
    employment_type: args.employment_type,
    salary_band: args.salary_band,
    prefecture: args.prefecture,
    jobs_count: 0,
    candidates_count: 0,
  };
}

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
    const tenantId = resolveTenantId(req, body);

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

    // 組み合わせ生成（空配列は「未指定＝null」扱い）
    const L = large.length ? large : [null];
    const S = small.length ? small : [null];
    const A = age.length ? age : [null];
    const E = emp.length ? emp : [null];
    const Sa = sal.length ? sal : [null];
    const P = pref.length ? pref : [null];

    const combos = cartesian<string | null>([L, S, A, E, Sa, P]);
    const MAX_PER_SITE = Math.max(1, Math.floor(want / sites.length) || 1);

    const preview: PreviewRow[] = [];
    for (const site of sites) {
      let count = 0;
      for (const c of combos) {
        if (count >= MAX_PER_SITE) break;
        const [lg, sm, ag, em, sa, pr] = c;
        const res = await collectCountsForSite({
          site,
          internal_large: lg ?? null,
          internal_small: sm ?? null,
          age_band: ag ?? null,
          employment_type: em ?? null,
          salary_band: sa ?? null,
          prefecture: pr ?? null,
        });

        preview.push({
          site_key: site,
          site_category_code: res.site_category_code ?? null,
          site_category_label: res.site_category_label ?? null,
          internal_large: res.internal_large ?? null,
          internal_small: res.internal_small ?? null,
          age_band: res.age_band ?? null,
          employment_type: res.employment_type ?? null,
          salary_band: res.salary_band ?? null,
          prefecture: res.prefecture ?? null,
          jobs_count: Number.isFinite(res.jobs_count)
            ? (res.jobs_count as number)
            : null,
          candidates_count: Number.isFinite(res.candidates_count)
            ? (res.candidates_count as number)
            : null,
        });
        count++;
      }
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const result_id = crypto.randomUUID();

    let saved = 0;
    let history_id: string | null = null;

    if (saveMode === "counts") {
      // job_board_counts へ保存
      const rows = preview.map((r) => ({
        result_id,
        site_key: r.site_key,
        site_category_code: r.site_category_code ?? null,
        site_category_label: r.site_category_label ?? null,
        internal_large: r.internal_large ?? null,
        internal_small: r.internal_small ?? null,
        age_band: r.age_band ?? null,
        employment_type: r.employment_type ?? null,
        salary_band: r.salary_band ?? null,
        prefecture: r.prefecture ?? null,
        jobs_count: r.jobs_count ?? null,
        candidates_count: r.candidates_count ?? null,
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
      // 履歴として保存（job_board_manual_runs）
      const { data, error } = await admin
        .from("job_board_manual_runs")
        .insert({
          tenant_id: tenantId,
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
        })
        .select("id")
        .single();
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
      history_id = data?.id ?? null;
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
