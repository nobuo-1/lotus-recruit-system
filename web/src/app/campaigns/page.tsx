import React from "react";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";

type Schedule = {
  campaign_id: string;
  scheduled_at: string | null;
  status: string | null;
};

type CampaignRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  subject: string | null;
  status: string | null;
  created_at: string | null;
};

function deriveStatus(baseStatus: string | null, schedules: Schedule[]) {
  const base = (baseStatus ?? "draft").toLowerCase();
  const now = Date.now();
  const isFuture = (s: Schedule) =>
    s.scheduled_at &&
    s.status !== "cancelled" &&
    Date.parse(s.scheduled_at) > now;
  const isExecuted = (s: Schedule) => {
    const st = (s.status ?? "").toLowerCase();
    return (
      st === "queued" || st === "sent" || st === "processing" || st === "done"
    );
  };
  const futureCount = schedules.filter(isFuture).length;
  const executedCount = schedules.filter(isExecuted).length;
  if (futureCount > 0 && executedCount > 0) return "scheduled/queued";
  if (futureCount > 0) return "scheduled";
  if (executedCount > 0) return "queued";
  return base;
}

function nextScheduleText(schedules: Schedule[]) {
  const now = Date.now();
  const future = schedules.filter(
    (s) =>
      s.scheduled_at &&
      s.status !== "cancelled" &&
      Date.parse(s.scheduled_at) > now
  );
  if (future.length === 0) return "";
  future.sort(
    (a, b) =>
      Date.parse(a.scheduled_at as string) -
      Date.parse(b.scheduled_at as string)
  );
  const first = future[0];
  const rest = future.length - 1;
  const when = formatJpDateTime(first.scheduled_at);
  return `${when}${rest > 0 ? `  +${rest}` : ""}`;
}

export default async function CampaignsPage() {
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

  const { data: campaigns, error: ce } = await supabase
    .from("campaigns")
    .select("id, tenant_id, name, subject, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .returns<CampaignRow[]>();
  if (ce) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-red-600">
          キャンペーン取得に失敗しました: {ce.message}
        </p>
      </main>
    );
  }

  const rows = campaigns ?? [];
  const ids = rows.map((r) => r.id);
  const byCamp = new Map<string, Schedule[]>();

  if (ids.length > 0) {
    try {
      const { data: sch } = await supabase
        .from("email_schedules")
        .select("campaign_id, scheduled_at, status")
        .in("campaign_id", ids)
        .returns<Schedule[]>();
      (sch ?? []).forEach((s) => {
        const arr = byCamp.get(s.campaign_id) ?? [];
        arr.push(s);
        byCamp.set(s.campaign_id, arr);
      });
    } catch {}
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* ヘッダー：スマホ縦積み */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            キャンペーン一覧
          </h1>
          <p className="text-sm text-neutral-500">作成したキャンペーンの一覧</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/email"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            メール配信トップ
          </Link>
          <Link
            href="/email/schedules"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            キャンペーン予約リスト
          </Link>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            新規作成
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left">キャンペーン名</th>
              <th className="px-3 py-3 text-left">件名</th>
              <th className="px-3 py-3 text-left">ステータス</th>
              <th className="px-3 py-3 text-left">予約</th>
              <th className="px-3 py-3 text-left">作成日</th>
              <th className="px-3 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const schedules = byCamp.get(r.id) ?? [];
              const status = deriveStatus(r.status, schedules);
              const nextText = nextScheduleText(schedules);
              return (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">{r.name ?? ""}</td>
                  <td className="px-3 py-3 text-neutral-600">
                    {r.subject ?? ""}
                  </td>
                  <td className="px-3 py-3">{status}</td>
                  <td className="px-3 py-3">{nextText}</td>
                  <td className="px-3 py-3">
                    {formatJpDateTime(r.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/campaigns/${r.id}`}
                        className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                      >
                        詳細
                      </Link>
                      <Link
                        href={`/campaigns/${r.id}/send`}
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
                  colSpan={6}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  キャンペーンはありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
