// web/src/app/api/form-outreach/companies/fetch/start/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Filters = {
  prefectures?: string[];
  employee_size_ranges?: Array<"1-9" | "10-49" | "50-249" | "250+">;
  keywords?: string[];
  industries_large?: string[];
  industries_small?: string[];
  max?: number;
};

type StartBody = {
  filters?: Filters;
  want?: number;
  seed?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: any, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Supabase service role not configured" },
        { status: 500 }
      );
    }
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "x-tenant-id required" },
        { status: 400 }
      );
    }

    const body: StartBody = await req.json().catch(() => ({} as StartBody));
    const want = clamp(body?.want ?? body?.filters?.max ?? 50, 1, 500);
    const filters: Filters = body?.filters ?? {};
    const seed = String(body?.seed || Math.random()).slice(2);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 新規 Run を queued で作成
    const { data: ins, error: insErr } = await admin
      .from("form_outreach_company_fetch_runs")
      .insert({
        tenant_id: tenantId,
        status: "queued", // queued / running / done / canceled
        progress: 0,
        inserted: 0,
        want,
        filters,
        seed,
      })
      .select("id")
      .single();

    if (insErr) {
      return NextResponse.json(
        { ok: false, error: insErr.message },
        { status: 500 }
      );
    }
    const run_id: string = ins!.id;

    // worker を起こす（完了は待たず、短時間だけベストエフォート）
    try {
      const u = new URL(
        "/api/form-outreach/companies/fetch/worker",
        req.url
      ).toString();
      await Promise.race([
        fetch(u, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": tenantId,
          },
          body: JSON.stringify({ run_id }),
        }).catch(() => null),
        sleep(1500),
      ]);
    } catch {
      /* noop: Cron / 手動起動でも継続可能 */
    }

    return NextResponse.json({ ok: true, run_id });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
