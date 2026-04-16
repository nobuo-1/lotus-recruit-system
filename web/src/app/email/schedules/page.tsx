// web/src/app/email/schedules/page.tsx
import React from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ConfirmCancelButton from "@/components/ConfirmCancelButton";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";
import {
  DataTableCard,
  PageHero,
  PageMain,
  SurfaceCard,
  StatChip,
} from "@/components/PageChrome";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  campaign_id: string;
  status: string | null;
  scheduled_at: string | null;
  created_at: string | null;
  campaigns: { id: string; name: string | null; subject: string | null } | null;
};

export default async function CampaignSchedulesPage() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) {
    return (
      <>
        <AppHeader showBack />
        <PageMain>ログインが必要です。</PageMain>
      </>
    );
  }

  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? null;

  const nowISO = new Date().toISOString();

  // 未来の予約のみ取得（件名/名前は campaigns 結合で取得）
  let q = sb
    .from("email_schedules")
    .select(
      "id, campaign_id, status, scheduled_at, created_at, campaigns(id, name, subject)"
    )
    .eq("status", "scheduled")
    .gte("scheduled_at", nowISO)
    .order("scheduled_at", { ascending: true });

  if (tenantId) q = q.eq("tenant_id", tenantId);

  const { data: rows, error } = await q.returns<Row[]>();
  if (error) console.error("[email_schedules:list]", error);

  const isCancelable = (r: Row) =>
    (r.status ?? "").toLowerCase() === "scheduled" &&
    !!r.scheduled_at &&
    Date.parse(r.scheduled_at) > Date.now();

  return (
    <>
      <AppHeader showBack />
      <PageMain className="space-y-6">
        <PageHero
          eyebrow="Campaign Schedules"
          title="予約中のキャンペーンを一覧で確認"
          description="予約日時、作成日、詳細導線、キャンセル操作をメール一覧ページと同じ見た目で整理しています。"
          accent="gold"
          actions={[
            { href: "/campaigns", label: "キャンペーン一覧", variant: "secondary" },
          ]}
        />

        <SurfaceCard>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatChip label="予約件数" value={(rows ?? []).length} />
            <StatChip label="最短予約" value={rows?.[0]?.scheduled_at ? formatJpDateTime(rows[0].scheduled_at) : "-"} />
            <StatChip label="表示内容" value="未来の scheduled のみ" />
          </div>
        </SurfaceCard>

        <DataTableCard className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="bg-[linear-gradient(180deg,#fbfbfc_0%,#f3f5f8_100%)] text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">キャンペーン名</th>
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
                    {r.campaigns?.name ?? "(無題キャンペーン)"}
                  </td>
                  <td className="px-3 py-3 text-neutral-600">
                    {r.campaigns?.subject ?? "-"}
                  </td>
                  <td className="px-3 py-3">
                    {formatJpDateTime(r.scheduled_at)}
                  </td>
                  <td className="px-3 py-3">
                    {formatJpDateTime(r.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={
                          r.campaign_id
                            ? `/campaigns/${r.campaign_id}`
                            : "/campaigns"
                        }
                        className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                      >
                        詳細
                      </Link>
                      {isCancelable(r) && (
                        <ConfirmCancelButton
                          action="/api/campaigns/schedules/cancel"
                          idValue={r.id}
                          label="予約をキャンセル"
                          className="rounded-xl border px-3 py-1 whitespace-nowrap border-red-300 text-red-700 hover:bg-red-50"
                          confirmText="このキャンペーン予約をキャンセルします。よろしいですか？"
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
    </>
  );
}
