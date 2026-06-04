// web/src/app/api/form-outreach/senders/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const BASE_COLUMNS = [
  "id",
  "sender_company",
  "from_header_name",
  "from_name",
  "from_email",
  "reply_to",
  "phone",
  "website",
  "signature",
  "postal_code",
  "sender_prefecture",
  "sender_address",
  "sender_last_name",
  "sender_first_name",
  "is_default",
];

const EXTENDED_COLUMNS = [
  "id",
  "sender_type",
  "sender_company",
  "sender_company_kana",
  "sender_department",
  "sender_position",
  "from_header_name",
  "from_name",
  "sender_name_kana",
  "from_email",
  "reply_to",
  "phone",
  "website",
  "signature",
  "postal_code",
  "sender_prefecture",
  "sender_address",
  "sender_last_name",
  "sender_first_name",
  "sender_last_name_kana",
  "sender_first_name_kana",
  "is_default",
];

const EXTRA_COLUMNS = new Set(EXTENDED_COLUMNS.filter((c) => !BASE_COLUMNS.includes(c)));

function isSchemaCacheMissingColumn(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return (
    error.code === "PGRST204" ||
    /schema cache|Could not find .* column/i.test(error.message || "")
  );
}

export async function GET() {
  const sb = await supabaseServer();
  const query = (columns: string[]) => sb
    .from("form_outreach_senders")
    .select(columns.join(","))
    .eq("is_default", true)
    .limit(1);

  let { data, error } = await query(EXTENDED_COLUMNS);

  if (isSchemaCacheMissingColumn(error)) {
    const fallback = await query(BASE_COLUMNS);
    data = fallback.data;
    error = fallback.error;
    if (!error) {
      return NextResponse.json({
        row: (data ?? [])[0] ?? null,
        needs_migration: true,
      });
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ row: (data ?? [])[0] ?? null });
}

export async function PUT(req: Request) {
  const sb = await supabaseServer();
  const body = await req.json();

  const buildPayload = (columns: string[]) => Object.fromEntries(
    columns
      .filter((key) => key !== "id")
      .map((key) => [key, body?.[key] ?? null])
  );

  const payload = buildPayload(EXTENDED_COLUMNS);
  payload.is_default = true;
  payload.sender_type =
    payload.sender_type === "individual" ? "individual" : "corporate";
  const fallbackPayload = buildPayload(BASE_COLUMNS);
  fallbackPayload.is_default = true;

  // 既定行があれば update、無ければ insert（部分ユニークindexにより is_default=true はテナントで1件）
  const { data, error: selErr } = await sb
    .from("form_outreach_senders")
    .select("id")
    .eq("is_default", true)
    .limit(1);

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 400 });
  }

  if ((data ?? []).length > 0) {
    const id = data![0].id as string;
    let { error } = await sb
      .from("form_outreach_senders")
      .update(payload)
      .eq("id", id);
    let needsMigration = false;
    if (isSchemaCacheMissingColumn(error)) {
      needsMigration = true;
      const retry = await sb
        .from("form_outreach_senders")
        .update(fallbackPayload)
        .eq("id", id);
      error = retry.error;
    }
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (needsMigration) {
      return NextResponse.json({
        ok: true,
        needs_migration: true,
        ignored_columns: Array.from(EXTRA_COLUMNS),
      });
    }
  } else {
    let { error } = await sb
      .from("form_outreach_senders")
      .insert(payload);
    let needsMigration = false;
    if (isSchemaCacheMissingColumn(error)) {
      needsMigration = true;
      const retry = await sb
        .from("form_outreach_senders")
        .insert(fallbackPayload);
      error = retry.error;
    }
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (needsMigration) {
      return NextResponse.json({
        ok: true,
        needs_migration: true,
        ignored_columns: Array.from(EXTRA_COLUMNS),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
