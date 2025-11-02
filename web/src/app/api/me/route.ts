import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  // Cookie付きのクライアント（ログイン状態を見る用）
  const supabase = await supabaseServer();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (userErr || !user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // profiles は RLS で守られているので、サーバ限定の service_role で参照
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile, // tenant_id / role
  });
}
