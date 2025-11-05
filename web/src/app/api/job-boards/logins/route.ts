// web/src/app/api/job-boards/logins/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET() {
  try {
    const sb = admin();
    const { data, error } = await sb
      .from("job_board_logins")
      .select("id, site_key, username, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ rows: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { site_key, username, password } = await req.json();
    if (!site_key || !username || !password)
      return NextResponse.json({ error: "invalid params" }, { status: 400 });
    const sb = admin();
    const { data, error } = await sb
      .from("job_board_logins")
      .upsert({ site_key, username, password })
      .select("id, site_key, username, created_at");
    if (error) throw error;
    return NextResponse.json({ rows: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json().catch(() => ({}));
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });
    const sb = admin();
    const { error } = await sb.from("job_board_logins").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
