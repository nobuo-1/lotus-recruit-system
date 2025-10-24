// web/src/app/api/form-outreach/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { opsQueue } from "@/server/queue";

type Payload = {
  companyIds: string[]; // form_outreach_companies.id[]
  channel: "form" | "email"; // まずはこの2種
  sequenceId?: string | null; // シーケンス紐付け任意
  stepNo?: number | null; // 手動なら1固定でもOK
  scheduleAt?: string | null; // 予約も可能
};

export async function POST(req: Request) {
  try {
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

    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;
    const companyIds = Array.isArray(body.companyIds) ? body.companyIds : [];
    const channel = body.channel === "email" ? "email" : "form";
    const sequenceId = body.sequenceId ?? null;
    const stepNo = body.stepNo ?? 1;
    const scheduleAtISO = body.scheduleAt ?? null;

    if (!companyIds.length) {
      return NextResponse.json(
        { error: "companyIds required" },
        { status: 400 }
      );
    }

    // jobs生成
    const jobsToInsert = companyIds.map((cid) => ({
      tenant_id: tenantId,
      company_id: cid,
      sequence_id: sequenceId,
      step_no: stepNo,
      channel,
      status: scheduleAtISO ? "queued" : "queued",
      scheduled_at: scheduleAtISO
        ? new Date(scheduleAtISO).toISOString()
        : null,
      payload: null,
    }));

    const { data: inserted, error } = await sb
      .from("form_outreach_jobs")
      .insert(jobsToInsert)
      .select("id");

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    // キュー投入
    let delay = 0;
    if (scheduleAtISO) {
      const ts = Date.parse(scheduleAtISO);
      if (!Number.isFinite(ts)) {
        return NextResponse.json(
          { error: "invalid scheduleAt" },
          { status: 400 }
        );
      }
      delay = Math.max(0, ts - Date.now());
    }

    for (const r of inserted ?? []) {
      await opsQueue.add(
        "form_outreach",
        {
          kind: "form_outreach",
          tenantId,
          jobId: r.id,
          channel,
        },
        { jobId: `form_outreach:${r.id}`, delay }
      );
    }

    return NextResponse.json({ ok: true, queued: inserted?.length ?? 0 });
  } catch (e: any) {
    console.error("[api.form-outreach.send] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
