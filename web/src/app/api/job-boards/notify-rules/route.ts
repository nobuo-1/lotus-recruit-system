// web/src/app/api/job-boards/notify-rules/route.ts
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

async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.job_board_notify_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name text NOT NULL,
        email text,
        sites text[] NOT NULL DEFAULT '{}',
        age_bands text[] NOT NULL DEFAULT '{}',
        employment_types text[] NOT NULL DEFAULT '{}',
        salary_bands text[] NOT NULL DEFAULT '{}',
        enabled boolean NOT NULL DEFAULT true,
        schedule_type text NOT NULL DEFAULT 'weekly',
        schedule_time time with time zone,
        schedule_days integer[] NOT NULL DEFAULT '{1}',
        timezone text NOT NULL DEFAULT 'Asia/Tokyo',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS public.job_board_destinations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name text NOT NULL,
        type text NOT NULL, -- 'email' | 'slack' | etc
        value text NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS public.job_board_notify_rule_destinations (
        rule_id uuid NOT NULL REFERENCES public.job_board_notify_rules(id) ON DELETE CASCADE,
        destination_id uuid NOT NULL REFERENCES public.job_board_destinations(id) ON DELETE CASCADE,
        PRIMARY KEY (rule_id, destination_id)
      );
    `);
  } finally {
    client.release();
  }
}

export async function GET() {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT *
       FROM public.job_board_notify_rules
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

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = await req.json();
  const {
    name,
    sites = [],
    age_bands = [],
    employment_types = [],
    salary_bands = [],
    enabled = true,
    schedule_type = "weekly",
    schedule_time,
    schedule_days = [1],
    timezone = "Asia/Tokyo",
    destination_ids = [],
  } = body || {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO public.job_board_notify_rules
       (tenant_id, name, sites, age_bands, employment_types, salary_bands,
        enabled, schedule_type, schedule_time, schedule_days, timezone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        TENANT,
        name,
        sites,
        age_bands,
        employment_types,
        salary_bands,
        enabled,
        schedule_type,
        schedule_time ? schedule_time : null,
        schedule_days,
        timezone,
      ]
    );
    const ruleId = ins.rows[0].id as string;

    if (Array.isArray(destination_ids) && destination_ids.length) {
      const values = destination_ids.map((_, i) => `($1, $${i + 2})`).join(",");
      await client.query(
        `INSERT INTO public.job_board_notify_rule_destinations(rule_id, destination_id)
         VALUES ${values}`,
        [ruleId, ...destination_ids]
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: ruleId });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
