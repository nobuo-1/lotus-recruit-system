// web/src/app/api/form-outreach/templates/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/** GET /api/form-outreach/templates/:id */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    const id = params.id;
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id required" },
        { status: 400 }
      );
    }
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const sb = await supabaseServer();
    const { data, error } = await sb
      .from("form_outreach_messages")
      .select(
        "id, tenant_id, name, subject, body_text, body_html, channel, created_at"
      )
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/** PATCH /api/form-outreach/templates/:id */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    const id = params.id;
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id required" },
        { status: 400 }
      );
    }
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const payload: Record<string, any> = {};
    if (typeof body.name === "string") payload.name = body.name;
    if (typeof body.subject === "string") payload.subject = body.subject;
    if (typeof body.body_text === "string") payload.body_text = body.body_text;

    const sb = await supabaseServer();
    const { data, error } = await sb
      .from("form_outreach_messages")
      .update(payload)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/** DELETE /api/form-outreach/templates/:id */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    const id = params.id;
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id required" },
        { status: 400 }
      );
    }
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const sb = await supabaseServer();
    const { error } = await sb
      .from("form_outreach_messages")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
