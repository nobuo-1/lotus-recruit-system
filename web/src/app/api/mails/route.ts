// web/src/app/api/mails/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

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

  const tenant_id = prof?.tenant_id as string | undefined;
  if (!tenant_id) return NextResponse.json({ rows: [] });

  const { data, error } = await sb
    .from("mails")
    .select("id, name, subject, status, created_at, updated_at")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, name, subject, body_text } = body || {};
  if (!name || !subject || !body_text)
    return NextResponse.json({ error: "invalid" }, { status: 400 });

  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();

  const tenant_id = prof?.tenant_id as string | undefined;
  if (!tenant_id)
    return NextResponse.json({ error: "no tenant" }, { status: 400 });

  if (id) {
    const { error } = await sb
      .from("mails")
      .update({ name, subject, body_text })
      .eq("id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id });
  } else {
    const { data, error } = await sb
      .from("mails")
      .insert({ tenant_id, name, subject, body_text })
      .select("id")
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data?.id });
  }
}
