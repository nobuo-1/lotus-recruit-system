// web/src/app/api/form-outreach/companies/fetch/route.ts
import { NextRequest, NextResponse } from "next/server";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function h(tenantId: string) {
  return {
    apikey: KEY!,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "x-tenant-id": tenantId,
    Prefer: "resolution=merge-duplicates",
  };
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Number(body?.limit ?? 100));
    const needForm = body?.needForm as "" | "yes" | "no";
    const needEmail = body?.needEmail as "" | "yes" | "no";
    const since = body?.since as string | undefined;

    const steps: any = {
      discover: {},
      parse: {},
      dedupe: {},
      enrich: {},
      upsert: {},
    };

    // 1) discover: 既存から候補取得
    const qs: string[] = [
      `tenant_id=eq.${tenantId}`,
      "select=id,company_name,website,contact_form_url,contact_email,job_site_source,created_at",
    ];
    if (since) qs.push(`created_at=gte.${since}T00:00:00Z`);
    const url = `${URL}/rest/v1/form_prospects?${qs.join(
      "&"
    )}&order=created_at.desc&limit=${limit}`;
    const r1 = await fetch(url, { headers: h(tenantId), cache: "no-store" });
    const rows = await r1.json();
    if (!r1.ok)
      return NextResponse.json(
        { error: rows?.message || "discover failed" },
        { status: r1.status }
      );

    let candidates: any[] = Array.isArray(rows) ? rows : [];
    steps.discover.found = candidates.length;

    // 2) parse: 必要なフィールドの整形（簡易）
    const parsed = candidates.map((x) => ({
      id: x.id,
      tenant_id: tenantId,
      company_name: x.company_name || null,
      website: x.website || null,
      contact_form_url: x.contact_form_url || null,
      contact_email: x.contact_email || null,
      job_site_source: x.job_site_source || null,
      created_at: x.created_at || new Date().toISOString(),
    }));
    steps.parse.ok = parsed.length;

    // 条件適用（フォーム/メール）
    const filtered = parsed.filter((p) => {
      if (needForm === "yes" && !(p.contact_form_url || "").trim())
        return false;
      if (needForm === "no" && (p.contact_form_url || "").trim()) return false;
      if (needEmail === "yes" && !(p.contact_email || "").trim()) return false;
      if (needEmail === "no" && (p.contact_email || "").trim()) return false;
      return true;
    });

    // 3) dedupe: ここでは id で重複除去（簡易）
    const seen = new Set<string>();
    const uniq = filtered.filter((p) => {
      const key = String(p.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    steps.dedupe.skipped = filtered.length - uniq.length;

    // データが全く無ければダミーを数件作る（最初の導入補助）
    let toUpsert = uniq;
    if (toUpsert.length === 0) {
      const now = new Date().toISOString();
      toUpsert = Array.from({ length: Math.min(limit, 5) }).map((_, i) => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_name: `ダミー株式会社${i + 1}`,
        website: `https://example${i + 1}.co.jp/`,
        contact_form_url:
          needForm === "no" ? null : `https://example${i + 1}.co.jp/contact`,
        contact_email:
          needEmail === "no" ? null : `info${i + 1}@example${i + 1}.co.jp`,
        job_site_source: "manual",
        created_at: now,
      }));
    }

    // 4) enrich: 簡易の付加（ここではNOP的に件数を返すのみ）
    steps.enrich.enriched = toUpsert.length;

    // 5) upsert: form_prospects に UPSERT
    const r5 = await fetch(`${URL}/rest/v1/form_prospects`, {
      method: "POST",
      headers: h(tenantId),
      body: JSON.stringify(toUpsert),
    });
    const j5 = await r5.json();
    if (!r5.ok) {
      steps.upsert.error = j5?.message || "upsert failed";
      return NextResponse.json({ steps }, { status: r5.status });
    }
    steps.upsert.inserted = Array.isArray(j5) ? j5.length : toUpsert.length;

    return NextResponse.json({ steps });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
