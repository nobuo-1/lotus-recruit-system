// web/src/app/api/form-outreach/settings/filters/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function adminHeaders() {
  return {
    apikey: SERVICE_KEY!,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function resolveTenantId(req: NextRequest): Promise<string | null> {
  // 1) 優先：ヘッダ
  const h = req.headers.get("x-tenant-id");
  if (h) return h;

  // 2) フォールバック：ログインユーザー→profiles.tenant_id
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user) return null;

  const r = await fetch(
    `${URL}/rest/v1/profiles?select=tenant_id&id=eq.${encodeURIComponent(
      user.id
    )}&limit=1`,
    { headers: adminHeaders(), cache: "no-store" }
  );
  const rows = await r.json().catch(() => []);
  const tenantId =
    Array.isArray(rows) && rows[0]?.tenant_id ? rows[0].tenant_id : null;
  return tenantId;
}

function normalizeOut(row: any) {
  // クライアントが期待する形に正規化（未知列は安全に既定値へ）
  return {
    tenant_id: row?.tenant_id ?? null,
    prefectures: Array.isArray(row?.prefectures) ? row.prefectures : [],
    employee_size_ranges: Array.isArray(row?.employee_size_ranges)
      ? row.employee_size_ranges
      : [],
    keywords: Array.isArray(row?.keywords) ? row.keywords : [],

    // 互換: レガシー job_titles を読み取りだけ許容（DBになくても undefined なので安全）
    job_titles: Array.isArray(row?.job_titles) ? row.job_titles : [],

    // 拡張（存在すれば使う）
    industries_large: Array.isArray(row?.industries_large)
      ? row.industries_large
      : [],
    industries_small: Array.isArray(row?.industries_small)
      ? row.industries_small
      : Array.isArray(row?.industries)
      ? row.industries
      : Array.isArray(row?.job_titles)
      ? row.job_titles
      : [],

    // 新規: 資本金レンジ / 設立日レンジ
    capital_min: typeof row?.capital_min === "number" ? row.capital_min : null,
    capital_max: typeof row?.capital_max === "number" ? row.capital_max : null,
    established_from: row?.established_from ?? null,
    established_to: row?.established_to ?? null,

    updated_at: row?.updated_at ?? null,
    created_at: row?.created_at ?? null,
  };
}

async function loadExisting(tenantId: string) {
  const r = await fetch(
    `${URL}/rest/v1/form_outreach_filters?tenant_id=eq.${encodeURIComponent(
      tenantId
    )}&select=*&limit=1`,
    { headers: adminHeaders(), cache: "no-store" }
  );
  const rows = await r.json().catch(() => []);
  if (!r.ok) {
    throw new Error(rows?.message || "fetch failed");
  }
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/** エラーメッセージに応じて未知列を安全に取り除く（保険） */
function stripUnknownColsOnDemand(payload: any, message: string) {
  const msg = (message || "").toLowerCase();
  const p = { ...payload };

  // このAPIでは job_titles は DB に存在しない前提
  if ("job_titles" in p) delete p.job_titles;

  // 環境差異で industries_* が未作成なケースにも保険で対応
  if (msg.includes("industries_large")) delete p.industries_large;
  if (msg.includes("industries_small")) delete p.industries_small;

  // これ以上削っても効果がない場合は null を返す
  if (
    payload.job_titles === undefined &&
    payload.industries_large === p.industries_large &&
    payload.industries_small === p.industries_small
  ) {
    return null;
  }
  return p;
}

/** GET: 現在のフィルタ取得（テナント別） */
export async function GET(req: NextRequest) {
  try {
    if (!URL || !SERVICE_KEY) {
      return NextResponse.json(
        { error: "server env not configured" },
        { status: 500 }
      );
    }
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const row = await loadExisting(tenantId);
    if (!row) {
      // デフォルト空
      return NextResponse.json({
        filters: normalizeOut({ tenant_id: tenantId }),
      });
    }
    return NextResponse.json({ filters: normalizeOut(row) });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/** POST: upsert（存在すれば更新、なければ新規） */
export async function POST(req: NextRequest) {
  try {
    if (!URL || !SERVICE_KEY) {
      return NextResponse.json(
        { error: "server env not configured" },
        { status: 500 }
      );
    }
    const tenantId = (req.headers.get("x-tenant-id") ||
      (await resolveTenantId(req))) as string | null;
    if (!tenantId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const input = body?.filters ?? {};

    // 新規項目を含めた保存ペイロード（DBに存在しない job_titles は書かない）
    const now = new Date().toISOString();
    const basePayload: any = {
      tenant_id: tenantId,
      prefectures: Array.isArray(input.prefectures) ? input.prefectures : [],
      employee_size_ranges: Array.isArray(input.employee_size_ranges)
        ? input.employee_size_ranges
        : [],
      keywords: Array.isArray(input.keywords) ? input.keywords : [],
      industries_large: Array.isArray(input.industries_large)
        ? input.industries_large
        : [],
      industries_small: Array.isArray(input.industries_small)
        ? input.industries_small
        : [],

      // 新規: 資本金レンジ / 設立日レンジ
      capital_min:
        typeof input.capital_min === "number" ? input.capital_min : null,
      capital_max:
        typeof input.capital_max === "number" ? input.capital_max : null,
      established_from:
        typeof input.established_from === "string"
          ? input.established_from
          : null,
      established_to:
        typeof input.established_to === "string" ? input.established_to : null,

      updated_at: now,
    };

    const exists = await loadExisting(tenantId);

    // まずは PATCH（存在時）
    if (exists) {
      let r = await fetch(
        `${URL}/rest/v1/form_outreach_filters?tenant_id=eq.${encodeURIComponent(
          tenantId
        )}`,
        {
          method: "PATCH",
          headers: adminHeaders(),
          body: JSON.stringify(basePayload),
        }
      );
      let j = await r.json().catch(() => ({}));

      if (!r.ok) {
        const stripped = stripUnknownColsOnDemand(
          basePayload,
          j?.message || ""
        );
        if (stripped) {
          r = await fetch(
            `${URL}/rest/v1/form_outreach_filters?tenant_id=eq.${encodeURIComponent(
              tenantId
            )}`,
            {
              method: "PATCH",
              headers: adminHeaders(),
              body: JSON.stringify(stripped),
            }
          );
          j = await r.json().catch(() => ({}));
        }
      }

      if (!r.ok) {
        return NextResponse.json(
          { error: j?.message || "save failed" },
          { status: r.status || 500 }
        );
      }
      const saved = Array.isArray(j) && j[0] ? j[0] : exists;
      return NextResponse.json({ filters: normalizeOut(saved) });
    }

    // 存在しない場合は INSERT
    let r = await fetch(`${URL}/rest/v1/form_outreach_filters`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ ...basePayload, created_at: now }),
    });
    let j = await r.json().catch(() => ({}));

    if (!r.ok) {
      const stripped = stripUnknownColsOnDemand(
        { ...basePayload, created_at: now },
        j?.message || ""
      );
      if (stripped) {
        r = await fetch(`${URL}/rest/v1/form_outreach_filters`, {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify(stripped),
        });
        j = await r.json().catch(() => ({}));
      }
    }

    if (!r.ok) {
      return NextResponse.json(
        { error: j?.message || "insert failed" },
        { status: r.status || 500 }
      );
    }
    const saved = Array.isArray(j) && j[0] ? j[0] : basePayload;
    return NextResponse.json({ filters: normalizeOut(saved) });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
