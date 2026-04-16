import React from "react";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";
import {
  DataTableCard,
  PageHero,
  PageMain,
  SectionTitle,
  SurfaceCard,
  StatChip,
} from "@/components/PageChrome";

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

function statusClass(status: string) {
  if (status === "scheduled") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "scheduled/queued") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "queued") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-neutral-100 text-neutral-700 border-neutral-200";
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
    <PageMain className="space-y-6">
      <PageHero
        eyebrow="Campaign List"
        title="キャンペーン施策を一覧で整理"
        description="予約配信の有無や実行状況を見ながら、個別の詳細・送信画面へ移動できます。"
        accent="gold"
        actions={[
          { href: "/campaigns/new", label: "新規キャンペーン", variant: "primary" },
          { href: "/email/schedules", label: "予約一覧", variant: "secondary" },
        ]}
      />

      <SurfaceCard>
        <SectionTitle
          title="一覧サマリー"
          description="進行中の施策と予約状況を素早く把握できます。"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatChip label="キャンペーン総数" value={rows.length} />
          <StatChip
            label="予約あり"
            value={rows.filter((r) => deriveStatus(r.status, byCamp.get(r.id) ?? []) === "scheduled").length}
          />
          <StatChip
            label="送信待ち/進行中"
            value={rows.filter((r) => {
              const status = deriveStatus(r.status, byCamp.get(r.id) ?? []);
              return status === "queued" || status === "scheduled/queued";
            }).length}
          />
        </div>
      </SurfaceCard>

      <DataTableCard className="overflow-x-auto">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-[linear-gradient(180deg,#fbfbfc_0%,#f3f5f8_100%)] text-neutral-600">
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
                  <td className="px-3 py-3 font-medium text-neutral-950">{r.name ?? ""}</td>
                  <td className="px-3 py-3 text-neutral-600">
                    {r.subject ?? ""}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-neutral-600">{nextText}</td>
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
      </DataTableCard>
    </PageMain>
  );
}
