// web/src/app/api/form-outreach/companies/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const contacted = searchParams.get("contacted"); // "true" | "false" | null

  let sel = sb
    .from("form_outreach_companies")
    .select(
      "id, source_site, company_name, site_company_url, official_website_url, contact_form_url, contact_email, created_at"
    )
    .eq("tenant_id", u.user.id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (q) {
    sel = sel
      .ilike("company_name", `%${q}%`)
      .or(`official_website_url.ilike.%${q}%`);
  }

  const { data, error } = await sel;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // 簡易「コンタクト済み判定」＝ 同一ドメイン宛の送信ログがあるか
  const rows = data ?? [];
  const domains = Array.from(
    new Set(
      rows
        .map(
          (r) =>
            (r.official_website_url || "")
              .replace(/^https?:\/\//, "")
              .split("/")[0]
        )
        .filter(Boolean)
    )
  );
  let contactedDomain = new Set<string>();
  if (domains.length > 0) {
    const { data: msgs } = await sb
      .from("form_outreach_messages")
      .select("id, form_url, email")
      .eq("tenant_id", u.user.id)
      .neq("channel", "template")
      .order("created_at", { ascending: false });
    (msgs || []).forEach((m) => {
      const d =
        (m.email || "").split("@")[1] ||
        (m.form_url || "").replace(/^https?:\/\//, "").split("/")[0] ||
        "";
      if (d) contactedDomain.add(d);
    });
  }

  const shaped = rows.map((r) => {
    const d = (r.official_website_url || "")
      .replace(/^https?:\/\//, "")
      .split("/")[0];
    return { ...r, contacted: d ? contactedDomain.has(d) : false };
  });

  const filtered =
    contacted == null
      ? shaped
      : shaped.filter((x) =>
          contacted === "true" ? x.contacted : !x.contacted
        );

  return NextResponse.json({ rows: filtered });
}
