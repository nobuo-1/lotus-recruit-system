// web/src/app/api/form-outreach/conflicts/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function GET() {
  // TODO: 実際に form_outreach_conflicts 的なテーブルができたら、
  //  ここで Supabase から rows を返すように変更してください。
  return NextResponse.json(
    {
      rows: [],
    },
    { status: 200 }
  );
}
