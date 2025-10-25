// web/src/app/api/form-outreach/prospects/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "form"; // form | email
  const sb = await supabaseServer();

  const col = mode === "form" ? "contact_form_url" : "contact_email";
  const { data, error } = await sb
    .from("form_prospects")
    .select("id, company_name, website_url, contact_email, contact_form_url")
    .not(col as any, "is", null)
    .limit(100);

  if (error) return NextResponse.json({ rows: [] });
  return NextResponse.json({ rows: data ?? [] });
}
