export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "40", 10),
    100
  );
  const page = Math.max(parseInt(url.searchParams.get("page") || "0", 10), 0);
  const offset = page * limit;
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
  const { data: items } = await admin
    .from("form_prospects")
    .select(
      "id,name,site_url,contact_form_url,created_at,last_contacted_at,status"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  const { count } = await admin
    .from("form_prospects")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const total = count ?? 0;
  return NextResponse.json({
    ok: true,
    items: items ?? [],
    paging: {
      page,
      limit,
      total,
      hasPrev: page > 0,
      hasNext: offset + limit < total,
    },
  });
}
