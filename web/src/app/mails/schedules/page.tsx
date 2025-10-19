import React from "react";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";

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
  const tenantId = prof?.tenant_id as string | undefined;

  const { data: rows } = await supabase
    .from("mail_schedules")
    .select(
      "id, mail_id, scheduled_at, status, created_at, mails(id, name, subject)"
    )
    .eq("tenant_id", tenantId)
    .order("scheduled_at", { ascending: true })
    .returns<Row[]>();

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            メール予約リスト
          </h1>
          <p className="text-sm text-neutral-500">作成済みの予約配信の一覧</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/email"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            メール配信トップ
          </Link>
          <Link
            href="/mails/new"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            新規作成
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-[1080px] w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left">メール名</th>
              <th className="px-3 py-3 text-left">件名</th>
              <th className="px-3 py-3 text-left">予約日時</th>
              <th className="px-3 py-3 text-left">ステータス</th>
              <th className="px-3 py-3 text-left">作成日</th>
              <th className="px-3 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-t border-neutral-200">
                <td className="px-3 py-3">{r.mails?.name ?? ""}</td>
                <td className="px-3 py-3 text-neutral-600">
                  {r.mails?.subject ?? ""}
                </td>
                <td className="px-3 py-3">
                  {formatJpDateTime(r.scheduled_at)}
                </td>
                <td className="px-3 py-3">{r.status ?? ""}</td>
                <td className="px-3 py-3">{formatJpDateTime(r.created_at)}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/mails/${r.mail_id}`}
                      className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                    >
                      詳細
                    </Link>
                    <Link
                      href={`/mails/${r.mail_id}/send`}
                      className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                    >
                      送信
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={6}
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
