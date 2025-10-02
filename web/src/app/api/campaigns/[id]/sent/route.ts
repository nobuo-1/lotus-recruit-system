// web/src/app/api/campaigns/[id]/sent/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type DeliveredIdRow = { recipient_id: string };

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const supabase = await supabaseServer();

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return NextResponse.json({ ids: [] });

    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();

    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId) return NextResponse.json({ ids: [] });

    const { data, error } = await supabase
      .from("deliveries")
      .select("recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", id)
      .in("status", ["scheduled", "queued", "sent"]);

    if (error) return NextResponse.json({ ids: [] });

    const list = (data ?? []) as DeliveredIdRow[];
    const ids = Array.from(new Set(list.map((r) => r.recipient_id)));
    return NextResponse.json({ ids });
  } catch {
    return NextResponse.json({ ids: [] });
  }
}
