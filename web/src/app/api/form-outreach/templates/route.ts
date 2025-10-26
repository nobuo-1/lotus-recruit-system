// web/src/app/api/form-outreach/templates/route.ts
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

// GET: prospect_id が NULL の行をテンプレートと見なす
export async function GET() {
  try {
    const q =
      "form_outreach_messages?select=*&prospect_id=is.null&order=created_at.desc";
    const res = await fetch(`${SB_URL}/rest/v1/${q}`, {
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

// POST: 新規テンプレ作成
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      subject,
      body_text,
      body_html,
      channel = "template",
      step = 0,
      tenant_id,
    } = body;

    const res = await fetch(`${SB_URL}/rest/v1/form_outreach_messages`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify([
        {
          name,
          subject,
          body_text,
          body_html,
          channel,
          step,
          tenant_id,
          prospect_id: null,
          status: null,
          error: null,
        },
      ]),
    });
    if (!res.ok) throw new Error(await res.text());
    const [row] = await res.json();
    return NextResponse.json({ row });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
