//web/src/app/api/form-outreach/automation/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function GET() {
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
  const { data } = await admin
    .from("form_outreach_schedules")
    .select("id,flow,cron,enabled,last_run_at,next_run_at")
    .eq("tenant_id", tenantId)
    .order("flow", { ascending: true });
  return NextResponse.json({ items: data ?? [] });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
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
  if (!body?.id)
    return NextResponse.json({ error: "id required" }, { status: 400 });
  await admin
    .from("form_outreach_schedules")
    .update({ enabled: !!body.enabled })
    .eq("tenant_id", tenantId)
    .eq("id", body.id);
  return NextResponse.json({ ok: true });
}
