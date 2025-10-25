// web/src/app/api/job-boards/notify-emails/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("job_board_notify_emails")
    .select("email")
    .order("email");
  return NextResponse.json({ emails: (data ?? []).map((r: any) => r.email) });
}
export async function POST(req: Request) {
  const { email } = await req.json();
  const sb = await supabaseServer();
  if (email) await sb.from("job_board_notify_emails").insert({ email });
  const { data } = await sb
    .from("job_board_notify_emails")
    .select("email")
    .order("email");
  return NextResponse.json({ emails: (data ?? []).map((r: any) => r.email) });
}
