// web/src/app/api/job-boards/destinations/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { Pool } from "pg";
const pool =
  (global as any).__pgPool ||
  ((global as any).__pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }));
const TENANT =
  process.env.SEED_TENANT_ID || "00000000-0000-0000-0000-000000000001";

export async function GET() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, name, type, value, enabled
       FROM public.job_board_destinations
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [TENANT]
    );
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
