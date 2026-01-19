import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidUuid(v: string | null | undefined): v is string {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

async function resolveTenantId(): Promise<string | null> {
  const sb = await supabaseServer();
  const { data: userRes, error: userErr } = await sb.auth.getUser();
  const user = userRes?.user;
  if (userErr || !user?.id) return null;

  const admin = supabaseAdmin();
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr) return null;
  return isValidUuid(profile?.tenant_id) ? profile?.tenant_id : null;
}

export async function GET() {
  try {
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("scout_clients")
      .select("id, tenant_id, client_name, memo, is_active, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : null;
    const clientName = String(body?.client_name || "").trim();
    const memo =
      typeof body?.memo === "string" ? body.memo.trim() : (body?.memo ?? null);
    const isActive =
      typeof body?.is_active === "boolean" ? body.is_active : true;

    if (!clientName) {
      return NextResponse.json(
        { error: "client_name is required" },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const now = new Date().toISOString();

    if (id && isValidUuid(id)) {
      const { data, error } = await admin
        .from("scout_clients")
        .update({
          client_name: clientName,
          memo,
          is_active: isActive,
          updated_at: now,
        })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("id, tenant_id, client_name, memo, is_active, created_at, updated_at")
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ row: data ?? null });
    }

    const { data, error } = await admin
      .from("scout_clients")
      .insert({
        tenant_id: tenantId,
        client_name: clientName,
        memo,
        is_active: isActive,
        created_at: now,
        updated_at: now,
      })
      .select("id, tenant_id, client_name, memo, is_active, created_at, updated_at")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ row: data ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : "";
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { error } = await admin
      .from("scout_clients")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
