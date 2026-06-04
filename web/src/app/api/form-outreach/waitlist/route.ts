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
    const reason = (url.searchParams.get("reason") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const q = (url.searchParams.get("q") || "").trim();

    const sb = await supabaseServer();

    const applyFilters = (query: any) => {
      let next = query.eq("tenant_id", tenantId);
      if (reason) next = next.eq("reason", reason);
      if (status) next = next.eq("status", status);
      if (q) {
        const like = `%${q}%`;
        next = next.or(
          `table_name.ilike.${like},prospect_id.ilike.${like},reason.ilike.${like},last_error.ilike.${like}`
        );
      }
      return next;
    };

    // 件数
    let countQuery = sb
      .from("form_outreach_waitlist")
      .select("id", { count: "exact", head: true } as any);
    countQuery = applyFilters(countQuery);
    const { count: total, error: countErr } = await countQuery;
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    // データ
    let dataQuery = sb
      .from("form_outreach_waitlist")
      .select("*");
    dataQuery = applyFilters(dataQuery);
    const { data, error } = await dataQuery
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
