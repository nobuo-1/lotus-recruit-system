import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE envs (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("mail_deliveries")
      .select("recipient_id")
      .eq("mail_id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const ids = (data ?? []).map(
      (r: { recipient_id: string }) => r.recipient_id
    );
    return NextResponse.json({ ids });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
