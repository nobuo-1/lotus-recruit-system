// web/src/app/api/job-boards/notify-rules/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

const SB_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

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
      `${SB_URL}/rest/v1/job_board_notify_rules?select=*`,
      {
        headers: sbHeaders(),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    // title を参照している既存 UI 互換
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
    const src = await req.json();
    const tenant_id =
      src.tenant_id ?? req.headers.get("x-tenant-id") ?? DEFAULT_TENANT_ID;

    // 本体
    const ins = await fetch(`${SB_URL}/rest/v1/job_board_notify_rules`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify([{ ...src, tenant_id }]),
    });
    if (!ins.ok) throw new Error(await ins.text());
    const [rule] = await ins.json();

    // 中間テーブル（送り先リンク）
    if (Array.isArray(src.destination_ids) && src.destination_ids.length > 0) {
      const linkRows = src.destination_ids.map((d: string) => ({
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
