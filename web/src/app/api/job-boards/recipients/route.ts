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
    .from("job_board_recipients")
    .select("id,email,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return NextResponse.json({ items: data ?? [] });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "");
  if (!email)
    return NextResponse.json({ error: "email required" }, { status: 400 });
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
    .from("job_board_recipients")
    .insert({ tenant_id: tenantId, email });
  return NextResponse.json({ ok: true });
}
