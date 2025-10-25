// web/src/app/api/form-outreach/companies/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = 40;
  const offset = (page - 1) * limit;

  const sb = await supabaseServer();
  const { data, error, count } = await sb
    .from("form_prospects")
    .select("id, company_name, website_url, contact_email, contact_form_url", {
      count: "exact",
    })
    .order("company_name", { ascending: true })
    .range(offset, offset + limit - 1);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  return NextResponse.json({
    rows: data ?? [],
    page,
    hasPrev: page > 1,
    hasNext: page < lastPage,
    total,
    lastPage,
  });
}
