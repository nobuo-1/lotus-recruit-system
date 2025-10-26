// web/src/app/api/form-outreach/prospects/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

const SB_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

function sbHeaders() {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

// GET /api/form-outreach/prospects?mode=form|email|all
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get("mode") || "all") as
      | "form"
      | "email"
      | "all";

    const base = new URL(`${SB_URL}/rest/v1/form_prospects`);
    base.searchParams.set(
      "select",
      "id,tenant_id,company_name,website,contact_email,contact_form_url,industry,company_size,job_site_source,status,created_at,updated_at"
    );
    base.searchParams.set("order", "created_at.desc");
    base.searchParams.set("limit", "200");

    if (mode === "form") {
      base.searchParams.set("contact_form_url", "not.is.null");
    } else if (mode === "email") {
      base.searchParams.set("contact_email", "not.is.null");
    }
    const res = await fetch(base.toString(), {
      headers: sbHeaders(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
