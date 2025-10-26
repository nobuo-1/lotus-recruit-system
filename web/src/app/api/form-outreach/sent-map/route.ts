// web/src/app/api/form-outreach/sent-map/route.ts
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
  };
}

export async function GET() {
  try {
    const q =
      "form_outreach_messages?select=prospect_id&prospect_id=not.is.null&sent_at=not.is.null";
    const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: sbHeaders() });
    if (!r.ok) throw new Error(await r.text());
    const rows = (await r.json()) as { prospect_id: string }[];
    const sentIds = Array.from(new Set(rows.map((x) => x.prospect_id)));
    return NextResponse.json({ sentIds });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
