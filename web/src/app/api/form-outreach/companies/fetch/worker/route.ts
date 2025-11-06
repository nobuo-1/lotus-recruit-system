// web/src/app/api/form-outreach/companies/fetch/worker/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

type Filters = {
  prefectures?: string[];
  employee_size_ranges?: Array<"1-9" | "10-49" | "50-249" | "250+">;
  keywords?: string[];
  industries_large?: string[];
  industries_small?: string[];
  max?: number;
};

type Candidate = {
  company_name: string;
  website?: string;
  contact_email?: string | null;
  contact_form_url?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  prefectures?: string[];
  company_size?: "1-9" | "10-49" | "50-249" | "250+" | null;
};

type AskBatchHint = { round: number; remain: number; seed?: string };

const JP_PREFS = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: any, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));

function normalizeUrl(u?: string): string | undefined {
  if (!u) return;
  try {
    const raw = u.trim();
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.hash = "";
    return url.toString();
  } catch {
    return;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 10000
) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        "user-agent":
          (init.headers as any)?.["user-agent"] ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
  } finally {
    clearTimeout(id);
  }
}

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 250_000);
}

function deobfuscateEmails(text: string): string[] {
  const alt = text
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*＠\s*/g, "@")
    .replace(/\s*\[dot\]\s*/gi, ".")
    .replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/＜?アットマーク＞?/g, "@")
    .replace(/＜?ドット＞?/g, ".");
  const re = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}(?:\.[A-Z]{2,})?/gi;
  return Array.from(new Set(alt.match(re) ?? []));
}

function extractEmails(
  text: string,
  html?: string,
  siteHost?: string
): string[] {
  const pool = new Set<string>();
  for (const e of deobfuscateEmails(text)) pool.add(e);

  if (html) {
    const mailtoRe = /href=["']mailto:([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = mailtoRe.exec(html))) {
      const raw = decodeURIComponent(m[1] || "");
      for (const e of deobfuscateEmails(raw)) pool.add(e);
    }
    const ldRe =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = ldRe.exec(html))) {
      try {
        const j = JSON.parse(m[1]);
        const cand = j?.email || j?.contactPoint?.email;
        if (typeof cand === "string") {
          for (const e of deobfuscateEmails(cand)) pool.add(e);
        }
      } catch {}
    }
  }
  const arr = [...pool];
  if (siteHost) {
    const main = arr.find((e) =>
      e.toLowerCase().endsWith(`@${siteHost.toLowerCase()}`)
    );
    if (main) return [main, ...arr.filter((x) => x !== main)];
  }
  return arr;
}

function extractCompanySizeToRange(text: string): Candidate["company_size"] {
  const t = text.replace(/[,，]/g, "");
  const m = /(従業員|社員|規模)[^0-9]{0,6}([0-9]{1,6})\s*(名|人|以上)?/.exec(t);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  if (n <= 9) return "1-9";
  if (n <= 49) return "10-49";
  if (n <= 249) return "50-249";
  return "250+";
}

function extractHQPrefecture(html: string, text: string): string[] {
  const prefs = new Set<string>();
  const hqBlock =
    /会社概要[\s\S]{0,1200}?本社[\s\S]{0,600}|本社[\s\S]{0,1000}?所在地|所在地[\s\S]{0,1000}?本社/;
  const sec = hqBlock.exec(html)?.[0] || "";
  const target = (sec || text).slice(0, 4000);
  for (const p of JP_PREFS) if (target.includes(p)) prefs.add(p);
  return [...prefs];
}

const INDUSTRY_MAP: Array<{ large: string; small: string; kw: RegExp }> = [
  { large: "IT・通信", small: "SaaS", kw: /(saas|クラウド|SaaS)/i },
  {
    large: "IT・通信",
    small: "受託開発",
    kw: /(受託|受注開発|システム開発|Web制作|アプリ開発)/i,
  },
  { large: "製造", small: "機械", kw: /(製造|工場|加工|機械|部品)/i },
  { large: "小売", small: "EC", kw: /(EC|通販|ネットショップ)/i },
  { large: "飲食", small: "外食", kw: /(飲食|レストラン|カフェ|居酒屋)/i },
];

function classifyIndustryFromText(text: string): {
  large?: string;
  small?: string;
} {
  for (const rule of INDUSTRY_MAP)
    if (rule.kw.test(text)) return { large: rule.large, small: rule.small };
  return {};
}

function resolveLinks(
  html: string,
  base: string
): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const href = new URL(m[1], base).toString();
      const label = m[2]
        .replace(/<[^>]*>/g, " ")
        .trim()
        .slice(0, 120);
      out.push({ href, label });
    } catch {}
  }
  return out;
}

async function findContactForm(
  url: string,
  html: string
): Promise<string | null> {
  const links = resolveLinks(html, url);
  const hit = links.find(({ href, label }) =>
    /contact|inquiry|お問い合わせ|お問合せ|問合せ/i.test(href + " " + label)
  );
  if (hit) return hit.href;

  const probes = [
    "/contact",
    "/contact-us",
    "/inquiry",
    "/inquiries",
    "/お問い合わせ",
    "/お問合せ",
    "/問合せ",
  ];
  for (const p of probes) {
    try {
      const u = new URL(p, url).toString();
      const r = await fetchWithTimeout(u, { method: "HEAD" }, 5000);
      if (r.ok) return u;
    } catch {}
  }
  return null;
}

async function verifyAndEnrich(c: Candidate): Promise<Candidate | null> {
  const site = normalizeUrl(c.website);
  if (!site) return null;

  try {
    const r = await fetchWithTimeout(site, {}, 12000);
    if (!r.ok) return null;
    const html = await r.text();
    const text = textFromHtml(html);

    let host = "";
    try {
      host = new URL(site).host;
    } catch {}

    const emails = extractEmails(text, html, host);
    const contact_form_url = await findContactForm(site, html);
    const size = extractCompanySizeToRange(text);
    const prefs = extractHQPrefecture(html, text);
    const ind = classifyIndustryFromText(text);

    return {
      company_name: c.company_name,
      website: site,
      contact_email: emails[0] ?? c.contact_email ?? null,
      contact_form_url,
      company_size: size ?? c.company_size ?? null,
      prefectures: (prefs.length ? prefs : c.prefectures ?? []).slice(0, 4),
      industry_large: c.industry_large ?? ind.large ?? null,
      industry_small: c.industry_small ?? ind.small ?? null,
    };
  } catch {
    return null;
  }
}

function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of cands) {
    const key = `${(c.website || "").toLowerCase()}__${c.company_name}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

function matchesFilters(c: Candidate, f: Filters): boolean {
  if (f.prefectures?.length) {
    const set = new Set((c.prefectures ?? []).map(String));
    if (![...set].some((p) => f.prefectures!.includes(p))) return false;
  }
  if (f.employee_size_ranges?.length) {
    if (!c.company_size || !f.employee_size_ranges.includes(c.company_size))
      return false;
  }
  if (f.industries_large?.length) {
    if (!c.industry_large || !f.industries_large.includes(c.industry_large))
      return false;
  }
  if (f.industries_small?.length) {
    if (!c.industry_small || !f.industries_small.includes(c.industry_small))
      return false;
  }
  if (f.keywords?.length) {
    const name = (c.company_name || "").toLowerCase();
    let host = "";
    try {
      host = new URL(c.website || "").host.toLowerCase();
    } catch {}
    const ok = f.keywords.some((kw) => {
      const k = String(kw || "").toLowerCase();
      return !!k && (name.includes(k) || host.includes(k));
    });
    if (!ok) return false;
  }
  return true;
}

async function askOpenAIForCompanies(
  filters: Filters,
  want: number,
  hint: AskBatchHint
): Promise<Candidate[]> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

  const sys =
    "You are a diligent Japanese business research assistant. Output STRICT JSON only, no commentary.";
  const prompt = `次の条件に合致する日本の企業候補を返してください。中小〜中堅企業も多めに、重複は避けること。
必ず https:// から始まる homepage URL を含め、可能なら従業員規模レンジ(company_size: "1-9"|"10-49"|"50-249"|"250+") を付与。
出力は JSON のみ: {"items":[{company_name, website, prefectures?, industry_large?, industry_small?, company_size?}]}。

条件:
- 都道府県: ${
    filters.prefectures?.length ? filters.prefectures.join(", ") : "全国"
  }
- 従業員規模レンジ: ${filters.employee_size_ranges?.join(", ") || "指定なし"}
- 任意キーワード: ${filters.keywords?.join(", ") || "指定なし"}
- 業種(大分類): ${filters.industries_large?.join(", ") || "指定なし"}
- 業種(小分類): ${filters.industries_small?.join(", ") || "指定なし"}
- ラウンド: ${hint.round} / 追加で最低 ${hint.remain} 社は新規に見つけること
- シード: ${hint.seed || "-"}
- 大手や上場だけに偏らないこと`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
    }),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${txt}`);

  let payload: any = {};
  try {
    const j = JSON.parse(txt);
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    payload = JSON.parse(content);
  } catch {
    payload = {};
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const mapped: Candidate[] = items
    .map((x: any) => ({
      company_name: String(x?.company_name || "").trim(),
      website: normalizeUrl(x?.website),
      industry_large:
        typeof x?.industry_large === "string" ? x.industry_large : null,
      industry_small:
        typeof x?.industry_small === "string" ? x.industry_small : null,
      prefectures: Array.isArray(x?.prefectures)
        ? x.prefectures.filter((p: any) => typeof p === "string")
        : [],
      company_size: ((): Candidate["company_size"] => {
        const v = String(x?.company_size || "").trim();
        return (["1-9", "10-49", "50-249", "250+"] as const).includes(v as any)
          ? (v as any)
          : null;
      })(),
    }))
    .filter((c: Candidate) => c.company_name && c.website);

  return mapped.slice(0, Math.max(want * 3, 60));
}

/** ========= 実行（分割・レジューム） ========= */
export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Supabase service role not configured" },
        { status: 500 }
      );
    }
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY not set" },
        { status: 400 }
      );
    }

    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId)
      return NextResponse.json(
        { ok: false, error: "x-tenant-id required" },
        { status: 400 }
      );

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = (await req.json().catch(() => ({}))) as { run_id?: string };

    // Run 特定（明示 run_id 優先、なければ queued/running の最古）
    let run: {
      id: string;
      status: string;
      progress: number;
      inserted: number;
      want: number;
      filters: any;
      seed: string | null;
      started_at: string | null;
    } | null = null;

    if (body?.run_id) {
      const { data, error } = await admin
        .from("form_outreach_company_fetch_runs")
        .select("id,status,progress,inserted,want,filters,seed,started_at")
        .eq("tenant_id", tenantId)
        .eq("id", body.run_id)
        .single();
      if (error)
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 404 }
        );
      run = data as any;
    } else {
      const { data, error } = await admin
        .from("form_outreach_company_fetch_runs")
        .select("id,status,progress,inserted,want,filters,seed,started_at")
        .eq("tenant_id", tenantId)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error)
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      run = (data as any) || null;
    }

    if (!run) {
      return NextResponse.json({ ok: true, note: "no queued/running run" });
    }
    if (run.status === "done") {
      return NextResponse.json({
        ok: true,
        note: "already done",
        run_id: run.id,
      });
    }
    if (run.status === "canceled") {
      return NextResponse.json({ ok: true, note: "canceled", run_id: run.id });
    }

    const filters: Filters = (run.filters as any) ?? {};
    const seed = (run.seed ?? String(Math.random()).slice(2)) as string;
    const want = clamp(run.want, 1, 500);
    let progress = clamp(run.progress, 0, want);
    let inserted = clamp(run.inserted, 0, want);

    // running 化
    {
      const { error } = await admin
        .from("form_outreach_company_fetch_runs")
        .update({
          status: "running",
          started_at: run.started_at ?? new Date().toISOString(),
        })
        .eq("id", run.id)
        .eq("tenant_id", tenantId);
      if (error)
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
    }

    // 既存 website（重複回避）
    const { data: existing, error: exErr } = await admin
      .from("form_prospects")
      .select("website")
      .eq("tenant_id", tenantId);
    if (exErr)
      return NextResponse.json(
        { ok: false, error: exErr.message },
        { status: 500 }
      );

    const existingSet = new Set(
      (existing || [])
        .map((r: any) => String(r.website || "").toLowerCase())
        .filter(Boolean)
    );

    // 予算
    const MAX_ROUNDS = 8;
    const CONCURRENCY = 8;
    const REQUEST_BUDGET_MS = 27_000;
    const t0 = Date.now();

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      // === 途中キャンセル/完了チェック === ※ここを maybeSingle() に修正
      {
        const { data: fresh } = await admin
          .from("form_outreach_company_fetch_runs")
          .select("status")
          .eq("id", run.id)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const st = (fresh as any)?.status as string | undefined;
        if (st === "canceled" || st === "done") {
          return NextResponse.json({
            ok: true,
            run_id: run.id,
            status: st,
            progress,
            inserted,
            want,
          });
        }
      }

      const remain = Math.max(0, want - progress);
      if (remain === 0) break;

      const llm = await askOpenAIForCompanies(filters, remain, {
        round,
        remain,
        seed: `${seed}-${round}`,
      });

      const pool = dedupe(
        llm.filter(
          (c) =>
            !!c.website && !existingSet.has(String(c.website).toLowerCase())
        )
      );

      if (!pool.length) {
        if (Date.now() - t0 > REQUEST_BUDGET_MS) break;
        continue;
      }

      for (let i = 0; i < pool.length; i += CONCURRENCY) {
        // === ループ内のキャンセル/完了チェック === ※ここも maybeSingle() に修正
        const { data: fresh } = await admin
          .from("form_outreach_company_fetch_runs")
          .select("status")
          .eq("id", run.id)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const st = (fresh as any)?.status as string | undefined;
        if (st === "canceled" || st === "done") {
          return NextResponse.json({
            ok: true,
            run_id: run.id,
            status: st,
            progress,
            inserted,
            want,
          });
        }

        const slice = pool.slice(i, i + CONCURRENCY);
        const chunk = await Promise.all(
          slice.map((cand) => verifyAndEnrich(cand))
        );
        const verified = (chunk.filter(Boolean) as Candidate[]).filter((cc) =>
          matchesFilters(cc, filters)
        );

        if (verified.length) {
          const rows = verified.map((c) => ({
            tenant_id: tenantId,
            company_name: c.company_name,
            website: c.website!,
            contact_form_url: c.contact_form_url ?? null,
            contact_email: c.contact_email ?? null,
            industry:
              [c.industry_large, c.industry_small]
                .filter(Boolean)
                .join(" / ") || null,
            company_size: c.company_size ?? null,
            job_site_source: "llm+web",
            status: "new",
            prefectures: c.prefectures ?? [],
          }));

          const { data: up, error: insErr } = await admin
            .from("form_prospects")
            .upsert(rows, { onConflict: "tenant_id,website" })
            .select("id");

          if (insErr) {
            await admin
              .from("form_outreach_company_fetch_runs")
              .update({ status: "running", progress, inserted })
              .eq("id", run.id)
              .eq("tenant_id", tenantId);
            return NextResponse.json(
              { ok: false, error: insErr.message },
              { status: 500 }
            );
          }

          const added = up?.length ?? 0;
          progress = clamp(progress + added, 0, want);
          inserted = clamp(inserted + added, 0, want);

          await admin
            .from("form_outreach_company_fetch_runs")
            .update({ progress, inserted })
            .eq("id", run.id)
            .eq("tenant_id", tenantId);
        }

        if (progress >= want) break;
        if (Date.now() - t0 > REQUEST_BUDGET_MS) break;
      }

      if (progress < want) await sleep(150);
      if (Date.now() - t0 > REQUEST_BUDGET_MS) break;
    }

    const done = progress >= want;
    const update: Record<string, any> = {
      status: done ? "done" : "running",
      progress,
      inserted,
    };
    if (done) update.finished_at = new Date().toISOString();

    const { error: upErr } = await admin
      .from("form_outreach_company_fetch_runs")
      .update(update)
      .eq("id", run.id)
      .eq("tenant_id", tenantId);

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: upErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      run_id: run.id,
      status: update.status,
      progress,
      inserted,
      want,
      budget_ms: Date.now() - t0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/** ========= キャンセル / 強制完了（管理操作） =========
 *  PATCH /api/form-outreach/companies/fetch/worker
 *  body: { run_id: string, action: "cancel" | "force_done" }
 */
export async function PATCH(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Supabase service role not configured" },
        { status: 500 }
      );
    }
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId)
      return NextResponse.json(
        { ok: false, error: "x-tenant-id required" },
        { status: 400 }
      );

    const { run_id, action } = (await req.json().catch(() => ({}))) as {
      run_id?: string;
      action?: "cancel" | "force_done";
    };

    if (!run_id || !action) {
      return NextResponse.json(
        { ok: false, error: "run_id and action(cancel|force_done) required" },
        { status: 400 }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === "cancel") {
      const { error } = await admin
        .from("form_outreach_company_fetch_runs")
        .update({ status: "canceled", finished_at: new Date().toISOString() })
        .eq("id", run_id)
        .eq("tenant_id", tenantId);
      if (error)
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      return NextResponse.json({ ok: true, run_id, status: "canceled" });
    }

    if (action === "force_done") {
      const { error } = await admin
        .from("form_outreach_company_fetch_runs")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("id", run_id)
        .eq("tenant_id", tenantId);
      if (error)
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      return NextResponse.json({ ok: true, run_id, status: "done" });
    }

    return NextResponse.json(
      { ok: false, error: "invalid action" },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
