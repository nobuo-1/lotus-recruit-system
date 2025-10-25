// web/src/app/api/job-boards/notify-rules/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId)
      return NextResponse.json({ error: "tenant not found" }, { status: 400 });

    const body = await req.json();
    const row = {
      tenant_id: tenantId,
      name: String(body?.name || "").slice(0, 200),
      sites: Array.isArray(body?.sites) ? body.sites : null,
      large_categories: Array.isArray(body?.large) ? body.large : null,
      small_categories: Array.isArray(body?.small) ? body.small : null,
      age_bands: Array.isArray(body?.age) ? body.age : null,
      employment_types: Array.isArray(body?.emp) ? body.emp : null,
      salary_bands: Array.isArray(body?.sal) ? body.sal : null,
      frequency: String(body?.frequency || "weekly"),
      is_active: !!body?.is_active,
    };

    const { error } = await sb
      .from("job_board_notify_rules")
      .insert(row as any);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
