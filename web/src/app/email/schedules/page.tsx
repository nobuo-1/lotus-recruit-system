// web/src/app/email/schedules/page.tsx
import React from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ConfirmCancelButton from "@/components/ConfirmCancelButton";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";

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
        <main className="mx-auto max-w-6xl p-6">ログインが必要です。</main>
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

  // campaigns を結合して件名/名前を取得、未来の scheduled のみ
  let q = sb
    .from("email_schedules")
    .select(
      "id, campaign_id, status, scheduled_at, created_at, campaigns(id, name, subject)"
    )
    .eq("status", "scheduled")
    .gte("scheduled_at", nowISO)
    .order("scheduled_at", { ascending: true });

  // tenant フィルタ（email_schedules に tenant カラムがある場合は条件追加、無い場合は campaigns 経由で担保）
  if (tenantId) {
    q = q.eq("tenant_id", tenantId);
  }

  const { data: rows, error } = await q.returns<Row[]>();
  if (error) {
    console.error("[email_schedules:list]", error);
  }

  const isCancelable = (r: Row) =>
    (r.status ?? "").toLowerCase() === "scheduled" &&
    !!r.scheduled_at &&
    Date.parse(r.scheduled_at) > Date.now();

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        {/* ヘッダー */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
              キャンペーン予約リスト
            </h1>
            <p className="text-sm text-neutral-500">
              予約中のメール配信を確認します
            </p>
          </div>
          <Link
            href="/email"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            メール配信トップへ
          </Link>
          <Link
            href="/campaigns"
            className="whitespace-nowrap rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            キャンペーン一覧へ
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
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
                  <td className="px-3 py-3">
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
        </div>
      </main>
    </>
  );
}
