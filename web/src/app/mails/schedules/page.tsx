import { supabaseServer } from "@/lib/supabaseServer";

async function load() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return [];
  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = prof?.tenant_id as string | undefined;
  if (!tenantId) return [];
  const { data } = await sb
    .from("mail_schedules")
    .select("id, mail_id, schedule_at, status, mails(name, subject)")
    .eq("tenant_id", tenantId)
    .order("schedule_at", { ascending: true });
  return data ?? [];
}

export default async function MailSchedulesPage() {
  const rows = await load();
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-4 text-2xl font-semibold text-neutral-900">
        メール予約リスト
      </h1>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left">メール名</th>
              <th className="px-3 py-3 text-left">件名</th>
              <th className="px-3 py-3 text-left">予約日時</th>
              <th className="px-3 py-3 text-center">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-3">{r.mails?.name ?? ""}</td>
                <td className="px-3 py-3">{r.mails?.subject ?? ""}</td>
                <td className="px-3 py-3">
                  {new Date(r.schedule_at).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-center">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  予約はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
