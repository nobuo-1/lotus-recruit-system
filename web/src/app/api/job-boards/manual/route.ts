export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const site = String(body.site || "");
  if (!site)
    return NextResponse.json({ error: "site required" }, { status: 400 });
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = prof?.tenant_id ?? null;
  const admin = supabaseAdmin();
  await admin
    .from("job_board_runs")
    .insert({
      tenant_id: tenantId,
      site,
      status: "queued",
      note: "manual trigger",
    });
  return NextResponse.json({ ok: true });
}
