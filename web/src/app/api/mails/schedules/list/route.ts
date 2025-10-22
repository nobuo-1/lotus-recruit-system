// web/src/app/api/mails/schedules/list/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? null;

    const nowISO = new Date().toISOString();

    let q = sb
      .from("mail_schedules")
      .select(
        "id, mail_id, scheduled_at:schedule_at, status, created_at, mails(id, name, subject)"
      )
      .eq("status", "scheduled")
      .gte("schedule_at", nowISO)
      .order("schedule_at", { ascending: true });

    if (tenantId) {
      q = q.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    } else {
      q = q.is("tenant_id", null);
    }

    const { data: rows, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ rows: rows ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
