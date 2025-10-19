// web/src/app/api/mails/[id]/sent/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("mail_deliveries")
    .select("recipient_id")
    .eq("mail_id", params.id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ids: (data ?? []).map((x) => x.recipient_id) });
}
