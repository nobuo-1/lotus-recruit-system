// web/src/app/api/form-outreach/automation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  const { data, error } = await sb
    .from("form_outreach_automation_settings")
    .select(
      "id, enabled, schedule_type, schedule_time, schedule_days, timezone"
    )
    .eq("tenant_id", u.user.id)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116")
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ row: data ?? null });
}

export async function PUT(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  const body = await req.json();

  const row = {
    tenant_id: u.user.id,
    enabled: !!body.enabled,
    schedule_type: body.schedule_type === "daily" ? "daily" : "weekly",
    schedule_time: String(body.schedule_time || "09:00"),
    schedule_days: (body.schedule_days as number[]) || [1],
    timezone: String(body.timezone || "Asia/Tokyo"),
  };

  // UPSERT（一意制約：tenant_id）
  const { error } = await sb
    .from("form_outreach_automation_settings")
    .upsert({ ...row }, { onConflict: "tenant_id" });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
