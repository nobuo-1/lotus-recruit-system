// web/src/app/api/job-boards/notify-rules/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  const { data, error } = await supabase
    .from("job_board_notify_rules")
    .select(
      "id, name, email, sites, age_bands, employment_types, salary_bands, enabled, schedule_type, schedule_time, schedule_days, timezone"
    )
    .eq("tenant_id", u.user.id) // NOTE: テナント=ユーザーID運用の場合。異なるなら profiles から取得に変更してください。
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  // 必須最小
  const row = {
    id: crypto.randomUUID(),
    tenant_id: u.user.id, // ※テナントIDの取得方法はプロジェクトに合わせて変更してください
    name: String(payload.name || "無題ルール"),
    email: null as string | null, // 旧互換（直接メールも可）
    sites: (payload.sites as string[]) || null,
    age_bands: (payload.age_bands as string[]) || null,
    employment_types: (payload.employment_types as string[]) || null,
    salary_bands: (payload.salary_bands as string[]) || null,
    enabled: Boolean(payload.enabled ?? true),
    schedule_type: String(payload.schedule_type || "weekly"),
    schedule_time: String(payload.schedule_time || "09:00"),
    schedule_days: (payload.schedule_days as number[]) || [1],
    timezone: String(payload.timezone || "Asia/Tokyo"),
    destination_ids: (payload.destination_ids as string[]) || null, // ← 新規
  };

  const { error } = await supabase
    .from("job_board_notify_rules")
    .insert(row as any);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: row.id });
}
