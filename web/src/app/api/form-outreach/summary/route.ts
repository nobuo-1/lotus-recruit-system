// web/src/app/api/form-outreach/summary/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await supabaseServer();

  // 総テンプレ数
  const { count: tplCount } = await supabase
    .from("form_outreach_templates")
    .select("*", { count: "exact", head: true });

  // 当月送信数
  const now = new Date();
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const { count: sentThisMonth } = await supabase
    .from("form_outreach_messages")
    .select("*", { count: "exact", head: true })
    .gte("sent_at", monthStart)
    .eq("status", "sent");

  // 見込み企業件数
  const { count: prospectCount } = await supabase
    .from("form_prospects")
    .select("*", { count: "exact", head: true });

  // 全期間送信累計
  const { count: allSent } = await supabase
    .from("form_outreach_messages")
    .select("*", { count: "exact", head: true })
    .eq("status", "sent");

  return NextResponse.json({
    tplCount: tplCount ?? 0,
    prospectCount: prospectCount ?? 0,
    sentThisMonth: sentThisMonth ?? 0,
    allSent: allSent ?? 0,
  });
}
