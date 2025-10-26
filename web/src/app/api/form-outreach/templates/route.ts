// web/src/app/api/form-outreach/templates/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
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
      `SELECT id, name, subject, body_text, body_html, created_at
         FROM public.form_outreach_messages
        WHERE tenant_id = $1
          AND prospect_id IS NULL
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

export async function POST(req: NextRequest) {
  const { name, subject, body_text, body_html } = await req.json();
  const client = await pool.connect();
  try {
    const ins = await client.query(
      `INSERT INTO public.form_outreach_messages
       (id, tenant_id, name, subject, body_text, body_html, channel, step, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'email', 0, 'template', now())
       RETURNING id`,
      [TENANT, name, subject, body_text, body_html]
    );
    return NextResponse.json({ ok: true, id: ins.rows[0].id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
