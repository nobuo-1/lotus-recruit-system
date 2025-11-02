// web/src/app/api/me/tenant/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic"; // 404回避のため静的最適化を無効化
export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    // profiles はRLS保護のため service_role で参照
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
      profile, // { tenant_id, role }
      tenant_id: profile?.tenant_id ?? null, // 取り回しやすいようトップレベルにも同梱
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
