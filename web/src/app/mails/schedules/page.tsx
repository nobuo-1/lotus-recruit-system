// web/src/app/mails/schedules/page.tsx
import React from "react";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";
import ConfirmCancelButton from "@/components/ConfirmCancelButton";
import {
  DataTableCard,
  PageHero,
  PageMain,
  SurfaceCard,
  StatChip,
} from "@/components/PageChrome";

type Row = {
  id: string;
  mail_id: string;
  scheduled_at: string | null;
  status: string | null;
  created_at: string | null;
  mails: { id: string; name: string | null; subject: string | null } | null;
};

export default async function MailSchedulesPage() {
  const supabase = await supabaseServer();

  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p>ログインが必要です</p>
      </main>
    );
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? null;

  const nowISO = new Date().toISOString();

  let q = supabase
    .from("mail_schedules")
    .select(
      "id, mail_id, scheduled_at:schedule_at, status, created_at, mails(id, name, subject)"
    )
    .eq("status", "scheduled")
    .gte("schedule_at", nowISO)
    .order("schedule_at", { ascending: true });

  if (tenantId) {
    q = q.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  } else {
    q = q.is("tenant_id", null);
  }

  const { data: rows, error } = await q.returns<Row[]>();
  if (error) {
    console.error("[mail_schedules:list]", error);
  }

  const isCancelable = (r: Row) =>
    (r.status ?? "").toLowerCase() === "scheduled" &&
    !!r.scheduled_at &&
    Date.parse(r.scheduled_at) > Date.now();

  return (
    <PageMain className="space-y-6">
      <PageHero
        eyebrow="Mail Schedules"
        title="予約済みメールを一覧で管理"
        description="予約日時、作成日、詳細導線、キャンセル操作をメール一覧ページと同じ構造で整理しています。"
        accent="blue"
        actions={[
          { href: "/mails", label: "メール一覧", variant: "secondary" },
          { href: "/mails/new", label: "新規メール", variant: "primary" },
        ]}
      />

      <SurfaceCard>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatChip label="予約件数" value={(rows ?? []).length} />
          <StatChip
            label="最短予約"
            value={rows?.[0]?.scheduled_at ? formatJpDateTime(rows[0].scheduled_at) : "-"}
          />
          <StatChip label="表示条件" value="未来の scheduled のみ" />
        </div>
      </SurfaceCard>

      <DataTableCard className="overflow-x-auto">
        <table className="min-w-[1080px] w-full text-sm">
          <thead className="bg-[linear-gradient(180deg,#fbfbfc_0%,#f3f5f8_100%)] text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left">メール名</th>
              <th className="px-3 py-3 text-left">件名</th>
              <th className="px-3 py-3 text-left">予約日時</th>
              <th className="px-3 py-3 text-left">作成日</th>
              <th className="px-3 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-t border-neutral-200">
                <td className="px-3 py-3 font-medium text-neutral-950">
                  {r.mails?.name ?? ""}
                </td>
                <td className="px-3 py-3 text-neutral-600">
                  {r.mails?.subject ?? ""}
                </td>
                <td className="px-3 py-3">
                  {formatJpDateTime(r.scheduled_at)}
                </td>
                <td className="px-3 py-3">{formatJpDateTime(r.created_at)}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/mails/${r.mail_id}`}
                      className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                    >
                      詳細
                    </Link>
                    {isCancelable(r) && (
                      <ConfirmCancelButton
                        action="/api/mails/schedules/cancel"
                        idValue={r.id}
                        label="予約をキャンセル"
                        className="rounded-xl border px-3 py-1 whitespace-nowrap border-red-300 text-red-700 hover:bg-red-50"
                        confirmText="このメール予約をキャンセルします。よろしいですか？"
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  予約はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableCard>
    </PageMain>
  );
}
