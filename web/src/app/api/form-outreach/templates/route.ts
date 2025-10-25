// web/src/app/api/form-outreach/templates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return NextResponse.json({ rows: [] });
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;

    // 「テンプレート」として扱う定義：
    // name があり、body_text あり、status が 'template' or null、step は null or 0
    const { data, error } = await sb
      .from("form_outreach_messages")
      .select("id, name, subject, body_text, body_html, channel")
      .eq("tenant_id", tenantId!)
      .or("status.is.null,status.eq.template")
      .or("step.is.null,step.eq.0")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = (data ?? [])
      .filter(
        (r: any) => (r?.name || r?.subject) && (r?.body_text || r?.body_html)
      )
      .map((r: any) => ({
        id: r.id,
        name: r.name || r.subject || "(無題)",
        channel: r.channel || "form",
        body_text: r.body_text || "",
        body_html: r.body_html || "",
      }));

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
