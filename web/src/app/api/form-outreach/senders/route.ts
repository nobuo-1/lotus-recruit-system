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
    .from("form_outreach_senders")
    .select("from_email,brand_name,reply_to")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return NextResponse.json({ settings: data ?? {} });
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
  // upsert
  const payload = {
    tenant_id: tenantId,
    from_email: body.from_email ?? null,
    brand_name: body.brand_name ?? null,
    reply_to: body.reply_to ?? null,
  };
  await admin
    .from("form_outreach_senders")
    .upsert(payload, { onConflict: "tenant_id" });
  return NextResponse.json({ ok: true });
}
