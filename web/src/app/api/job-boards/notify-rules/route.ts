// web/src/app/api/job-boards/notify-rules/route.ts
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
      `${SB_URL}/rest/v1/job_board_notify_rules?select=*`,
      {
        headers: sbHeaders(),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    const shaped = rows.map((r: any) => ({ ...r, title: r.name ?? r.title }));
    return NextResponse.json({ rows: shaped });
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
    const {
      name,
      email,
      sites,
      age_bands,
      employment_types,
      salary_bands,
      enabled,
      schedule_type,
      schedule_time,
      schedule_days,
      timezone,
      destination_ids,
      tenant_id,
    } = body;

    const insertRule = await fetch(`${SB_URL}/rest/v1/job_board_notify_rules`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify([
        {
          name,
          email,
          sites,
          age_bands,
          employment_types,
          salary_bands,
          enabled,
          schedule_type,
          schedule_time,
          schedule_days,
          timezone,
          tenant_id,
        },
      ]),
    });
    if (!insertRule.ok) throw new Error(await insertRule.text());
    const [rule] = await insertRule.json();

    if (Array.isArray(destination_ids) && destination_ids.length > 0) {
      const linkRows = destination_ids.map((d: string) => ({
        rule_id: rule.id,
        destination_id: d,
        tenant_id,
      }));
      const linkRes = await fetch(
        `${SB_URL}/rest/v1/job_board_notify_rule_destinations`,
        {
          method: "POST",
          headers: sbHeaders(),
          body: JSON.stringify(linkRows),
        }
      );
      if (!linkRes.ok) throw new Error(await linkRes.text());
    }

    return NextResponse.json({ row: rule });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
