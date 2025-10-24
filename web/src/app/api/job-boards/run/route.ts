// web/src/app/api/job-boards/run/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { opsQueue } from "@/server/queue";

type Payload = {
  site: "mynavi" | "doda" | "type" | "wtype" | "rikunavi" | "en";
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;
    const site = body.site as Payload["site"];

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    if (!site)
      return NextResponse.json({ error: "site required" }, { status: 400 });

    const { data: ins, error } = await sb
      .from("job_board_runs")
      .insert({
        tenant_id: tenantId,
        site,
        status: "queued",
      })
      .select("id")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    await opsQueue.add(
      "job_board_run",
      { kind: "job_board_run", tenantId, site, runId: ins.id },
      { jobId: `job_board_run:${tenantId}:${site}:${ins.id}` }
    );

    return NextResponse.json({ ok: true, runId: ins.id });
  } catch (e: any) {
    console.error("[api.job-boards.run] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
