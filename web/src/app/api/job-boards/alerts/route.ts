// web/src/app/api/job-boards/alerts/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("job_board_alert_targets")
    .select(
      "id, email, frequency, include_jobs, include_candidates, filters, enabled, created_at"
    )
    .order("created_at", { ascending: false });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const sb = await supabaseServer();
  const ins = { ...body, tenant_id: undefined }; // RLS の with check により current_tenant_id が必要
  // → サーバー側で明示的に設定できるなら profiles 経由で付与してもOK
  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .maybeSingle();
  await sb
    .from("job_board_alert_targets")
    .insert([{ ...body, tenant_id: prof?.tenant_id }]);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const body = await req.json(); // {id, ...fields}
  const { id, ...fields } = body || {};
  const sb = await supabaseServer();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await sb.from("job_board_alert_targets").update(fields).eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const sb = await supabaseServer();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await sb.from("job_board_alert_targets").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
