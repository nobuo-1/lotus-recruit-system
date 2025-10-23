// web/src/app/mails/page.tsx
import React from "react";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";

type MailRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  subject: string | null;
  status: string | null;
  created_at: string | null;
};

type DeliLite = {
  mail_id: string;
  status: string | null;
  scheduled_at?: string | null; // ← 無い環境もあるので optional
};

function deriveStatusFromDeliveries(ds: DeliLite[]) {
  const now = Date.now();
  const hasFuture = ds.some((d) => {
    if ((d.status ?? "").toLowerCase() !== "scheduled") return false;
    // scheduled_at が無いDBは「scheduledがあれば未来扱い」とする
    if (d.scheduled_at == null) return true;
    const ts = Date.parse(d.scheduled_at);
    return Number.isNaN(ts) ? true : ts > now;
  });
  const hasQueued = ds.some(
    (d) =>
      (d.status ?? "").toLowerCase() === "queued" ||
      (d.status ?? "").toLowerCase() === "processing"
  );
  const hasSent = ds.some((d) => (d.status ?? "").toLowerCase() === "sent");

  if (hasFuture && (hasQueued || hasSent)) return "scheduled/queued";
  if (hasFuture) return "scheduled";
  if (hasQueued || hasSent) return "queued";
  return "draft";
}

export default async function MailsPage() {
  const supabase = await supabaseServer();

  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-red-600">ログインが必要です。</p>
      </main>
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
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-red-600">テナント情報を取得できませんでした。</p>
      </main>
    );
  }

  const { data: mails, error: me } = await supabase
    .from("mails")
    .select("id, tenant_id, name, subject, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .returns<MailRow[]>();
  if (me) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-red-600">メール取得に失敗しました: {me.message}</p>
      </main>
    );
  }

  const rows = mails ?? [];
  const ids = rows.map((r) => r.id);

  // mail_deliveries から予約・キュー状況を集計（scheduled_atが無い環境にも対応）
  const byMail = new Map<string, DeliLite[]>();
  if (ids.length > 0) {
    // まず scheduled_at つきで試す
    let dels: any[] | null = null;
    let tryNoSched = false;
    {
      const { data, error } = await supabase
        .from("mail_deliveries")
        .select("mail_id, status, scheduled_at")
        .in("mail_id", ids);
      if (error && /scheduled_at/i.test(error.message)) {
        tryNoSched = true;
      } else {
        dels = data as any[] | null;
      }
    }
    if (tryNoSched) {
      const { data } = await supabase
        .from("mail_deliveries")
        .select("mail_id, status")
        .in("mail_id", ids);
      dels = data as any[] | null;
    }
    (dels ?? []).forEach((d) => {
      const arr = byMail.get(d.mail_id) ?? [];
      arr.push(d as DeliLite);
      byMail.set(d.mail_id, arr);
    });
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            メール一覧
          </h1>
          <p className="text-sm text-neutral-500">作成したメールの一覧</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/email"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            メール配信トップ
          </Link>
          <Link
            href="/mails/schedules"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            メール予約リスト
          </Link>
          <Link
            href="/mails/new"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            メール新規作成
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left">メール名</th>
              <th className="px-3 py-3 text-left">件名</th>
              <th className="px-3 py-3 text-left">ステータス</th>
              <th className="px-3 py-3 text-left">作成日</th>
              <th className="px-3 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = byMail.get(r.id) ?? [];
              const status = deriveStatusFromDeliveries(d);
              return (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">{r.name ?? ""}</td>
                  <td className="px-3 py-3 text-neutral-600">
                    {r.subject ?? ""}
                  </td>
                  <td className="px-3 py-3">{status}</td>
                  <td className="px-3 py-3">
                    {formatJpDateTime(r.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/mails/${r.id}`}
                        className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                      >
                        詳細
                      </Link>
                      <Link
                        href={`/mails/${r.id}/send`}
                        className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                      >
                        送信
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  メールはありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
