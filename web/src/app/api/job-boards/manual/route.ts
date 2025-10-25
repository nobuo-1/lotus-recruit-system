// web/src/app/api/job-boards/manual/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const body = await req.json();
  // job_board_runs が存在しない環境でも壊れないように on-the-fly で作ることも可能ですが、
  // ここでは insert を試み、エラーはそのまま返す（既存テーブルを使う）方針。
  const { error } = await supabase.from("job_board_runs").insert({
    status: "queued",
    filter_json: body, // JSONB 列を想定（存在しない場合はテーブル側を調整してください）
    requested_at: new Date().toISOString(),
  } as any);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
