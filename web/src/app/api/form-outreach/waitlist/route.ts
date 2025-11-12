// web/src/app/api/form-outreach/waitlist/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const PAGE_MIN = 1;
const PAGE_MAX = 100000;
const LIMIT_MIN = 1;
const LIMIT_MAX = 1000;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const limit = clamp(
      Number(url.searchParams.get("limit") || 10),
      LIMIT_MIN,
      LIMIT_MAX
    );
    const page = clamp(
      Number(url.searchParams.get("page") || 1),
      PAGE_MIN,
      PAGE_MAX
    );
    const offset = (page - 1) * limit;

    const sb = await supabaseServer();

    // 件数
    const { count: total, error: countErr } = await sb
      .from("form_outreach_waitlist")
      .select("id", { count: "exact", head: true } as any)
      .eq("tenant_id", tenantId);
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    // データ
    const { data, error } = await sb
      .from("form_outreach_waitlist")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rows: data ?? [],
      total: total ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
