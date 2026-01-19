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

export async function GET(req: Request) {
  try {
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const clientId = url.searchParams.get("client_id");

    const admin = supabaseAdmin();
    let query = admin
      .from("scout_client_logins")
      .select(
        "id, tenant_id, client_id, site_key, username, password, login_note, created_at, updated_at"
      )
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });

    if (clientId && isValidUuid(clientId)) {
      query = query.eq("client_id", clientId);
    }

    const { data, error } = await query;
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
    const clientId =
      typeof body?.client_id === "string" ? body.client_id : null;
    const siteKey = String(body?.site_key || "").trim();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();
    const loginNote =
      typeof body?.login_note === "string"
        ? body.login_note.trim()
        : (body?.login_note ?? null);

    if (!isValidUuid(clientId)) {
      return NextResponse.json(
        { error: "client_id is required" },
        { status: 400 }
      );
    }
    if (!siteKey || !username || !password) {
      return NextResponse.json(
        { error: "site_key, username, password are required" },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const now = new Date().toISOString();

    if (id && isValidUuid(id)) {
      const { data, error } = await admin
        .from("scout_client_logins")
        .update({
          site_key: siteKey,
          username,
          password,
          login_note: loginNote,
          updated_at: now,
        })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select(
          "id, tenant_id, client_id, site_key, username, password, login_note, created_at, updated_at"
        )
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ row: data ?? null });
    }

    const { data, error } = await admin
      .from("scout_client_logins")
      .upsert(
        {
          tenant_id: tenantId,
          client_id: clientId,
          site_key: siteKey,
          username,
          password,
          login_note: loginNote,
          created_at: now,
          updated_at: now,
        },
        { onConflict: "tenant_id,client_id,site_key" }
      )
      .select(
        "id, tenant_id, client_id, site_key, username, password, login_note, created_at, updated_at"
      )
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
      .from("scout_client_logins")
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
