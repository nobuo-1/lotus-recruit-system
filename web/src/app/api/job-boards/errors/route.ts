import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sites: string[] = Array.isArray(body?.sites) ? body.sites : [];
    if (sites.length === 0)
      return NextResponse.json({ error: "sites is required" }, { status: 400 });

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // job_board_runs にキューを積む（site_key を使用）
    for (const code of sites) {
      await sb
        .from("job_board_runs")
        .insert({ site_key: code, status: "queued" } as any);
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
