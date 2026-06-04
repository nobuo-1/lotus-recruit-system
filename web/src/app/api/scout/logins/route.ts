import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SELECT_COLUMNS = [
  "id",
  "tenant_id",
  "client_id",
  "site_key",
  "username",
  "password",
  "login_url",
  "account_label",
  "two_factor_method",
  "two_factor_contact",
  "two_factor_note",
  "contract_id",
  "plan_id",
  "job_posting_ids",
  "job_posting_names",
  "scout_template_ids",
  "target_search_url",
  "target_conditions",
  "exclusion_rules",
  "daily_send_limit",
  "operation_window",
  "sender_name",
  "sender_email",
  "reply_to",
  "status",
  "last_verified_at",
  "login_note",
  "created_at",
  "updated_at",
].join(", ");

function isValidUuid(v: string | null | undefined): v is string {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function optionalInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalDate(value: unknown) {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeTwoFactorMethod(value: unknown) {
  const method = optionalString(value);
  return ["none", "email", "sms", "app", "manual"].includes(method || "")
    ? method
    : "manual";
}

function normalizeStatus(value: unknown) {
  const status = optionalString(value);
  return ["ready", "needs_check", "paused"].includes(status || "")
    ? status
    : "needs_check";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
      .select(SELECT_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });

    if (clientId && isValidUuid(clientId)) {
      query = query.eq("client_id", clientId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
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
    const loginNote = optionalString(body?.login_note);

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
    const payload = {
      site_key: siteKey,
      username,
      password,
      login_url: optionalString(body?.login_url),
      account_label: optionalString(body?.account_label),
      two_factor_method: normalizeTwoFactorMethod(body?.two_factor_method),
      two_factor_contact: optionalString(body?.two_factor_contact),
      two_factor_note: optionalString(body?.two_factor_note),
      contract_id: optionalString(body?.contract_id),
      plan_id: optionalString(body?.plan_id),
      job_posting_ids: optionalString(body?.job_posting_ids),
      job_posting_names: optionalString(body?.job_posting_names),
      scout_template_ids: optionalString(body?.scout_template_ids),
      target_search_url: optionalString(body?.target_search_url),
      target_conditions: optionalString(body?.target_conditions),
      exclusion_rules: optionalString(body?.exclusion_rules),
      daily_send_limit: optionalInt(body?.daily_send_limit),
      operation_window: optionalString(body?.operation_window),
      sender_name: optionalString(body?.sender_name),
      sender_email: optionalString(body?.sender_email),
      reply_to: optionalString(body?.reply_to),
      status: normalizeStatus(body?.status),
      last_verified_at: optionalDate(body?.last_verified_at),
      login_note: loginNote,
      updated_at: now,
    };

    if (id && isValidUuid(id)) {
      const { data, error } = await admin
        .from("scout_client_logins")
        .update(payload)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select(SELECT_COLUMNS)
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ row: data ?? null });
    }

    const { data, error } = await admin
      .from("scout_client_logins")
      .upsert(
        {
          ...payload,
          tenant_id: tenantId,
          client_id: clientId,
          created_at: now,
        },
        { onConflict: "tenant_id,client_id,site_key" }
      )
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ row: data ?? null });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
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
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
