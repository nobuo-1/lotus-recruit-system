import { NextResponse } from "next/server";

export const runtime = "edge";

const SB_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const DEFAULT_TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type DestinationPayload = {
  name?: string;
  type?: string;
  value?: string;
  enabled?: boolean;
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

function normalizePayload(body: DestinationPayload) {
  return {
    name: typeof body.name === "string" ? body.name.trim() : "",
    type: typeof body.type === "string" ? body.type : "email",
    value: typeof body.value === "string" ? body.value.trim() : "",
    enabled: body.enabled ?? true,
  };
}

function hasOwn(body: unknown, key: string) {
  return isRecord(body) && Object.prototype.hasOwnProperty.call(body, key);
}

function buildDestinationPatch(body: DestinationPayload) {
  const patch: Record<string, unknown> = {};

  if (hasOwn(body, "name")) {
    patch.name = typeof body.name === "string" ? body.name.trim() : "";
  }
  if (hasOwn(body, "type")) {
    patch.type = typeof body.type === "string" ? body.type : "email";
  }
  if (hasOwn(body, "value")) {
    patch.value = typeof body.value === "string" ? body.value.trim() : "";
  }
  if (hasOwn(body, "enabled")) {
    patch.enabled = body.enabled ?? true;
  }

  return patch;
}

export async function GET(req: Request) {
  try {
    const tenantId = getTenantId(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    const query = id
      ? `${SB_URL}/rest/v1/job_board_destinations?select=*&tenant_id=eq.${encodeURIComponent(
          tenantId
        )}&id=eq.${encodeURIComponent(id)}`
      : `${SB_URL}/rest/v1/job_board_destinations?select=*&tenant_id=eq.${encodeURIComponent(
          tenantId
        )}&order=created_at.desc`;

    const res = await fetch(query, {
      headers: sbHeaders(false),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();
    return NextResponse.json({
      rows: Array.isArray(rows) ? rows : [],
      row: id && Array.isArray(rows) ? rows[0] ?? null : null,
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
    const body = (await req.json()) as DestinationPayload;
    const tenantId = getTenantId(req, body);
    const payload = normalizePayload(body);

    if (!payload.name || !payload.value) {
      return NextResponse.json(
        { error: "name と value は必須です" },
        { status: 400 }
      );
    }

    const res = await fetch(`${SB_URL}/rest/v1/job_board_destinations`, {
      method: "POST",
      headers: sbHeaders(true),
      body: JSON.stringify([{ ...payload, tenant_id: tenantId }]),
    });
    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();
    return NextResponse.json({ row: Array.isArray(rows) ? rows[0] ?? null : null });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

async function updateDestination(req: Request) {
  const body = (await req.json()) as
    | { id?: string; patch?: DestinationPayload }
    | (DestinationPayload & { id?: string });
  const tenantId = getTenantId(req, body);
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const patchSource =
    isRecord(body) && "patch" in body && isRecord(body.patch)
      ? (body.patch as DestinationPayload)
      : (body as DestinationPayload);
  const payload = buildDestinationPatch(patchSource);

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "更新内容がありません" }, { status: 400 });
  }

  const res = await fetch(
    `${SB_URL}/rest/v1/job_board_destinations?id=eq.${encodeURIComponent(
      id
    )}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
    {
      method: "PATCH",
      headers: sbHeaders(true),
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(await res.text());

  const rows = await res.json();
  return NextResponse.json({ row: Array.isArray(rows) ? rows[0] ?? null : null });
}

export async function PUT(req: Request) {
  try {
    return await updateDestination(req);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    return await updateDestination(req);
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

    const res = await fetch(
      `${SB_URL}/rest/v1/job_board_destinations?id=eq.${encodeURIComponent(
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
