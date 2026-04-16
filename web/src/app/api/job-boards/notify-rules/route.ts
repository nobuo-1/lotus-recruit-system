import { NextResponse } from "next/server";

export const runtime = "edge";

const SB_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const DEFAULT_TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type RuleBody = {
  id?: string;
  name?: string;
  email?: string | null;
  sites?: string[];
  pref?: string[];
  large?: string[];
  small?: string[];
  enabled?: boolean;
  schedule_type?: "daily" | "weekly";
  schedule_time?: string | null;
  schedule_days?: number[] | null;
  timezone?: string | null;
  destination_ids?: string[];
  patch?: Record<string, unknown>;
  tenant_id?: string;
};

function sbHeaders(json = true) {
  const headers: Record<string, string> = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
  };
  if (json) {
    headers["Content-Type"] = "application/json";
    headers["Prefer"] = "return=representation";
  }
  return headers;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function getTenantId(req: Request, body?: unknown) {
  const headerTenant = req.headers.get("x-tenant-id");
  if (headerTenant) return headerTenant;

  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i);
  if (match) return decodeURIComponent(match[2]);

  if (isRecord(body) && typeof body.tenant_id === "string" && body.tenant_id) {
    return body.tenant_id;
  }

  return DEFAULT_TENANT_ID;
}

function encodeIn(values: string[]) {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

async function fetchRules(tenantId: string, id?: string | null) {
  const filters = [
    `tenant_id=eq.${encodeURIComponent(tenantId)}`,
    id ? `id=eq.${encodeURIComponent(id)}` : "",
    "order=created_at.desc",
  ]
    .filter(Boolean)
    .join("&");

  const resRules = await fetch(
    `${SB_URL}/rest/v1/job_board_notify_rules?select=*&${filters}`,
    { headers: sbHeaders(false), cache: "no-store" }
  );
  if (!resRules.ok) throw new Error(await resRules.text());
  const rules = (await resRules.json()) as Record<string, unknown>[];

  if (rules.length === 0) return [];

  const ruleIds = rules
    .map((rule) => String(rule.id || ""))
    .filter((ruleId) => !!ruleId);
  const resLinks = await fetch(
    `${SB_URL}/rest/v1/job_board_notify_rule_destinations?select=rule_id,destination_id&rule_id=in.(${encodeIn(
      ruleIds
    )})`,
    { headers: sbHeaders(false), cache: "no-store" }
  );
  const links = resLinks.ok ? ((await resLinks.json()) as Record<string, string>[]) : [];

  const destIds = Array.from(
    new Set(
      links
        .map((link) => link.destination_id)
        .filter((destinationId): destinationId is string => !!destinationId)
    )
  );

  let destinations: Record<string, unknown>[] = [];
  if (destIds.length > 0) {
    const resDest = await fetch(
      `${SB_URL}/rest/v1/job_board_destinations?select=*&tenant_id=eq.${encodeURIComponent(
        tenantId
      )}&id=in.(${encodeIn(destIds)})`,
      { headers: sbHeaders(false), cache: "no-store" }
    );
    if (resDest.ok) {
      destinations = (await resDest.json()) as Record<string, unknown>[];
    }
  }

  const destinationMap = new Map<string, Record<string, unknown>>();
  for (const destination of destinations) {
    const destinationId = String(destination.id || "");
    if (destinationId) destinationMap.set(destinationId, destination);
  }

  const linkMap = new Map<string, string[]>();
  for (const link of links) {
    const ruleId = String(link.rule_id || "");
    const destinationId = String(link.destination_id || "");
    if (!ruleId || !destinationId) continue;
    const current = linkMap.get(ruleId) ?? [];
    current.push(destinationId);
    linkMap.set(ruleId, current);
  }

  return rules.map((rule) => {
    const ruleId = String(rule.id || "");
    const destinationIds = linkMap.get(ruleId) ?? [];
    return {
      ...rule,
      destination_ids: destinationIds,
      destinations: destinationIds
        .map((destinationId) => destinationMap.get(destinationId))
        .filter(Boolean),
    };
  });
}

function normalizeRulePayload(body: RuleBody) {
  const scheduleType = body.schedule_type === "daily" ? "daily" : "weekly";
  const scheduleDays =
    scheduleType === "weekly"
      ? Array.isArray(body.schedule_days)
        ? body.schedule_days
        : [1]
      : null;

  return {
    name: typeof body.name === "string" ? body.name.trim() : "",
    email: typeof body.email === "string" ? body.email.trim() : null,
    sites: Array.isArray(body.sites) ? body.sites : [],
    pref: Array.isArray(body.pref) ? body.pref : [],
    age_bands: [],
    employment_types: [],
    salary_bands: [],
    large: Array.isArray(body.large) ? body.large : [],
    small: Array.isArray(body.small) ? body.small : [],
    enabled: body.enabled ?? true,
    schedule_type: scheduleType,
    schedule_time:
      typeof body.schedule_time === "string" && body.schedule_time
        ? body.schedule_time
        : "09:00",
    schedule_days: scheduleDays,
    timezone:
      typeof body.timezone === "string" && body.timezone
        ? body.timezone
        : "Asia/Tokyo",
  };
}

function hasOwn(body: unknown, key: string) {
  return isRecord(body) && Object.prototype.hasOwnProperty.call(body, key);
}

function buildRulePatch(body: RuleBody) {
  const patch: Record<string, unknown> = {};

  if (hasOwn(body, "name")) {
    patch.name = typeof body.name === "string" ? body.name.trim() : "";
  }
  if (hasOwn(body, "email")) {
    patch.email = typeof body.email === "string" ? body.email.trim() : null;
  }
  if (hasOwn(body, "sites")) {
    patch.sites = Array.isArray(body.sites) ? body.sites : [];
    patch.age_bands = [];
    patch.employment_types = [];
    patch.salary_bands = [];
  }
  if (hasOwn(body, "pref")) {
    patch.pref = Array.isArray(body.pref) ? body.pref : [];
  }
  if (hasOwn(body, "large")) {
    patch.large = Array.isArray(body.large) ? body.large : [];
  }
  if (hasOwn(body, "small")) {
    patch.small = Array.isArray(body.small) ? body.small : [];
  }
  if (hasOwn(body, "enabled")) {
    patch.enabled = body.enabled ?? true;
  }
  if (hasOwn(body, "schedule_type")) {
    const scheduleType = body.schedule_type === "daily" ? "daily" : "weekly";
    patch.schedule_type = scheduleType;
    patch.schedule_days =
      scheduleType === "weekly"
        ? Array.isArray(body.schedule_days)
          ? body.schedule_days
          : [1]
        : null;
  } else if (hasOwn(body, "schedule_days")) {
    patch.schedule_days = Array.isArray(body.schedule_days) ? body.schedule_days : [1];
  }
  if (hasOwn(body, "schedule_time")) {
    patch.schedule_time =
      typeof body.schedule_time === "string" && body.schedule_time
        ? body.schedule_time
        : "09:00";
  }
  if (hasOwn(body, "timezone")) {
    patch.timezone =
      typeof body.timezone === "string" && body.timezone
        ? body.timezone
        : "Asia/Tokyo";
  }

  return patch;
}

async function replaceDestinationLinks(ruleId: string, destinationIds: string[]) {
  await fetch(
    `${SB_URL}/rest/v1/job_board_notify_rule_destinations?rule_id=eq.${encodeURIComponent(
      ruleId
    )}`,
    {
      method: "DELETE",
      headers: sbHeaders(false),
    }
  );

  if (destinationIds.length === 0) return;

  const rows = destinationIds.map((destinationId) => ({
    rule_id: ruleId,
    destination_id: destinationId,
  }));
  const res = await fetch(`${SB_URL}/rest/v1/job_board_notify_rule_destinations`, {
    method: "POST",
    headers: sbHeaders(true),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function GET(req: Request) {
  try {
    const tenantId = getTenantId(req);
    const id = new URL(req.url).searchParams.get("id");
    const rows = await fetchRules(tenantId, id);
    return NextResponse.json({
      rows,
      row: id ? rows[0] ?? null : null,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RuleBody;
    const tenantId = getTenantId(req, body);
    const payload = normalizeRulePayload(body);

    if (!payload.name) {
      return NextResponse.json({ error: "name は必須です" }, { status: 400 });
    }

    const res = await fetch(`${SB_URL}/rest/v1/job_board_notify_rules`, {
      method: "POST",
      headers: sbHeaders(true),
      body: JSON.stringify({ ...payload, tenant_id: tenantId }),
    });
    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();
    const inserted = Array.isArray(rows) ? rows[0] : null;
    const ruleId = inserted?.id ? String(inserted.id) : "";
    const destinationIds = Array.isArray(body.destination_ids)
      ? body.destination_ids
      : [];

    if (ruleId) {
      await replaceDestinationLinks(ruleId, destinationIds);
    }

    const hydrated = ruleId ? await fetchRules(tenantId, ruleId) : [];
    return NextResponse.json({ row: hydrated[0] ?? inserted });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

async function updateRule(req: Request) {
  const body = (await req.json()) as RuleBody;
  const tenantId = getTenantId(req, body);
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const patchSource =
    isRecord(body.patch) ? (body.patch as RuleBody) : (body as RuleBody);
  const destinationIds = Array.isArray(body.destination_ids)
    ? body.destination_ids
    : Array.isArray(patchSource.destination_ids)
      ? patchSource.destination_ids
      : undefined;

  const hasFieldsToUpdate =
    "name" in patchSource ||
    "email" in patchSource ||
    "sites" in patchSource ||
    "pref" in patchSource ||
    "large" in patchSource ||
    "small" in patchSource ||
    "enabled" in patchSource ||
    "schedule_type" in patchSource ||
    "schedule_time" in patchSource ||
    "schedule_days" in patchSource ||
    "timezone" in patchSource;

  if (hasFieldsToUpdate) {
    const payload = buildRulePatch(patchSource);
    const res = await fetch(
      `${SB_URL}/rest/v1/job_board_notify_rules?id=eq.${encodeURIComponent(
        id
      )}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
      {
        method: "PATCH",
        headers: sbHeaders(true),
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) throw new Error(await res.text());
  }

  if (destinationIds) {
    await replaceDestinationLinks(id, destinationIds);
  }

  const rows = await fetchRules(tenantId, id);
  return NextResponse.json({ row: rows[0] ?? null });
}

export async function PUT(req: Request) {
  try {
    return await updateRule(req);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    return await updateRule(req);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const tenantId = getTenantId(req, body);
    const id =
      url.searchParams.get("id") ||
      (isRecord(body) && typeof body.id === "string" ? body.id : "");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await fetch(
      `${SB_URL}/rest/v1/job_board_notify_rule_destinations?rule_id=eq.${encodeURIComponent(
        id
      )}`,
      {
        method: "DELETE",
        headers: sbHeaders(false),
      }
    );

    const res = await fetch(
      `${SB_URL}/rest/v1/job_board_notify_rules?id=eq.${encodeURIComponent(
        id
      )}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
      {
        method: "DELETE",
        headers: sbHeaders(false),
      }
    );
    if (!res.ok) throw new Error(await res.text());

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
