// web/src/app/form-outreach/messages/page.tsx
import React from "react";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";
import AppHeader from "@/components/AppHeader";

type Row = {
  id: string;
  tenant_id: string;
  name: string | null;
  email: string | null;
  form_url: string | null;
  step: number | null;
  channel: "form" | "email" | null;
  subject: string | null;
  body_text: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string | null;
};

export default async function FormMessagesPage() {
  const supabase = await supabaseServer();

  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return (
      <>
        <AppHeader showBack />
        <main className="mx-auto max-w-6xl p-6">
          <p className="text-red-600">ログインが必要です。</p>
        </main>
      </>
    );
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = prof?.tenant_id as string | undefined;

  if (!tenantId) {
    return (
      <>
        <AppHeader showBack />
        <main className="mx-auto max-w-6xl p-6">
          <p className="text-red-600">テナント情報を取得できませんでした。</p>
        </main>
      </>
    );
  }

  const { data: rows, error } = await supabase
    .from("form_outreach_messages")
    .select(
      "id, tenant_id, name, email, form_url, step, channel, subject, body_text, status, sent_at, created_at"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  if (error) {
    return (
      <>
        <AppHeader showBack />
        <main className="mx-auto max-w-6xl p-6">
          <p className="text-red-600">取得に失敗しました: {error.message}</p>
        </main>
      </>
    );
  }

  const list = rows ?? [];

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              送信ログ
            </h1>
            <p className="text-sm text-neutral-500">
              フォーム営業／メール送信の実行履歴
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/form-outreach/runs"
              className="rounded-xl border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
            >
              フロー詳細へ
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">対象</th>
                <th className="px-3 py-3 text-left">手段</th>
                <th className="px-3 py-3 text-left">件名</th>
                <th className="px-3 py-3 text-left">ステータス</th>
                <th className="px-3 py-3 text-left">送信日時</th>
                <th className="px-3 py-3 text-left">作成日時</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">
                    {r.name ?? ""}{" "}
                    <span className="text-neutral-500">
                      {r.email ? `(${r.email})` : r.form_url ? "(form)" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3">{r.channel ?? ""}</td>
                  <td className="px-3 py-3 text-neutral-600">
                    {r.subject ?? ""}
                  </td>
                  <td className="px-3 py-3">{r.status ?? ""}</td>
                  <td className="px-3 py-3">{formatJpDateTime(r.sent_at)}</td>
                  <td className="px-3 py-3">
                    {formatJpDateTime(r.created_at)}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    履歴はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
