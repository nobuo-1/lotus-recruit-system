// web/src/app/api/form-outreach/settings/filters/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type FiltersRow = {
  tenant_id: string;
  prefectures: string[] | null;
  employee_size_ranges: string[] | null;
  keywords: string[] | null;
  job_titles: string[] | null;
  updated_at: string | null;
  created_at?: string | null;
};

async function resolveTenantId(req: NextRequest): Promise<string | null> {
  const headerTid = req.headers.get("x-tenant-id");
  if (headerTid) return headerTid;

  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return null;
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    return prof?.tenant_id ?? null;
  } catch {
    return null;
  }
}

/** GET: 現在のフィルタを取得 */
export async function GET(req: NextRequest) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId)
      return NextResponse.json(
        { error: "tenant not resolved" },
        { status: 401 }
      );

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("form_outreach_filters")
      .select(
        "tenant_id, prefectures, employee_size_ranges, keywords, job_titles, updated_at, created_at"
      )
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const defaults: Omit<FiltersRow, "tenant_id"> = {
      prefectures: [],
      employee_size_ranges: [],
      keywords: [],
      job_titles: [],
      updated_at: null,
      created_at: null,
    };

    return NextResponse.json({
      filters: data ?? { tenant_id: tenantId, ...defaults },
      tenant_id: tenantId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/** POST: フィルタを更新（UPSERT） */
export async function POST(req: NextRequest) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId)
      return NextResponse.json(
        { error: "tenant not resolved" },
        { status: 401 }
      );

    const body = await req.json().catch(() => ({}));
    const {
      prefectures = [],
      employee_size_ranges = [],
      keywords = [],
      job_titles = [],
    } = body?.filters ?? {};

    const now = new Date().toISOString();
    const row: FiltersRow = {
      tenant_id: tenantId,
      prefectures,
      employee_size_ranges,
      keywords,
      job_titles,
      updated_at: now,
    };

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("form_outreach_filters")
      .upsert(row, { onConflict: "tenant_id" })
      .select(
        "tenant_id, prefectures, employee_size_ranges, keywords, job_titles, updated_at, created_at"
      )
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ filters: data ?? row, tenant_id: tenantId });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
