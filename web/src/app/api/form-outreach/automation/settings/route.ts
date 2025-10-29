// web/src/app/api/form-outreach/automation/settings/route.ts
import { NextRequest, NextResponse } from "next/server";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function headersJSON(tenantId: string) {
  return {
    apikey: SERVICE_KEY!,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates", // upsert
    "x-tenant-id": tenantId,
  };
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

    const r = await fetch(
      `${URL}/rest/v1/form_outreach_automation_settings?tenant_id=eq.${tenantId}&select=*`,
      { headers: headersJSON(tenantId), cache: "no-store" }
    );
    const rows = await r.json();
    if (!r.ok) {
      return NextResponse.json(
        { error: rows?.message || "fetch failed" },
        { status: r.status }
      );
    }

    const settings = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return NextResponse.json({
      settings,
      updated_at: settings?.updated_at ?? null,
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
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const settings = body?.settings ?? {};

    // UPSERT (tenant_id をユニーク制約にしてあるため merge-duplicates が効く)
    const payload = [
      {
        tenant_id: tenantId,
        ...settings,
        updated_at: new Date().toISOString(),
      },
    ];

    const r = await fetch(`${URL}/rest/v1/form_outreach_automation_settings`, {
      method: "POST",
      headers: headersJSON(tenantId),
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) {
      return NextResponse.json(
        { error: j?.message || "save failed" },
        { status: r.status }
      );
    }

    const saved = Array.isArray(j) && j.length > 0 ? j[0] : payload[0];
    return NextResponse.json({
      settings: saved,
      updated_at: saved?.updated_at ?? new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
