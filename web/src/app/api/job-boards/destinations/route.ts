// web/src/app/api/job-boards/destinations/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

const SB_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

// 本番既定テナント
const DEFAULT_TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

function sbHeaders() {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/job_board_destinations?select=*`,
      {
        headers: sbHeaders(),
        cache: "no-store",
      }
    );
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tenant_id =
      body.tenant_id ?? req.headers.get("x-tenant-id") ?? DEFAULT_TENANT_ID;

    const res = await fetch(`${SB_URL}/rest/v1/job_board_destinations`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify([{ ...body, tenant_id }]),
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

// enabled トグル
export async function PATCH(req: Request) {
  try {
    const { id, enabled } = (await req.json()) as {
      id: string;
      enabled: boolean;
    };
    const res = await fetch(
      `${SB_URL}/rest/v1/job_board_destinations?id=eq.${encodeURIComponent(
        id
      )}`,
      {
        method: "PATCH",
        headers: sbHeaders(),
        body: JSON.stringify({ enabled }),
      }
    );
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
