// web/src/app/api/job-boards/destinations/route.ts
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
    const res = await fetch(`${SB_URL}/rest/v1/job_board_destinations`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify([body]),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ row: rows?.[0] ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
