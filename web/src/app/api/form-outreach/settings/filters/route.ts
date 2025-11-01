// web/src/app/api/form-outreach/settings/filters/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId)
      return NextResponse.json(
        { error: "x-tenant-id required" },
        { status: 400 }
      );

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("form_outreach_filters")
      .select("tenant_id, prefectures, employee_size_ranges, updated_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      filters: data || {
        tenant_id: tenantId,
        prefectures: [],
        employee_size_ranges: [],
        updated_at: null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId)
      return NextResponse.json(
        { error: "x-tenant-id required" },
        { status: 400 }
      );

    const body = await req.json().catch(() => ({}));
    const prefectures: string[] = Array.isArray(body?.prefectures)
      ? body.prefectures
      : [];
    const employee_size_ranges: string[] = Array.isArray(
      body?.employee_size_ranges
    )
      ? body.employee_size_ranges
      : [];

    const admin = supabaseAdmin();
    const { error } = await admin.from("form_outreach_filters").upsert(
      {
        tenant_id: tenantId,
        prefectures,
        employee_size_ranges,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    );

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
