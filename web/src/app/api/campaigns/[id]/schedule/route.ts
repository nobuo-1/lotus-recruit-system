// web/src/app/api/campaigns/[id]/schedule/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({} as { when?: string }));
    const when = body?.when;
    if (!when) {
      return NextResponse.json({ error: "when required" }, { status: 400 });
    }

    const dt = new Date(when);
    if (Number.isNaN(dt.getTime())) {
      return NextResponse.json({ error: "invalid datetime" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("campaigns")
      .update({ status: "scheduled", scheduled_at: dt.toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, scheduled_at: dt.toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg ?? "internal error" },
      { status: 500 }
    );
  }
}
