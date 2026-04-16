// web/src/app/mails/page.tsx
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

function statusClass(status: string) {
  if (status === "scheduled") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "scheduled/queued") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "queued") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-neutral-100 text-neutral-700 border-neutral-200";
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
    <PageMain className="space-y-6">
      <PageHero
        eyebrow="Mail List"
        title="作成済みメールを一覧で管理"
        description="下書き、予約、送信待ちをまとめて見渡せる一覧です。個別の詳細や送信導線へ直接移動できます。"
        accent="blue"
        actions={[
          { href: "/mails/new", label: "新規メール", variant: "primary" },
          { href: "/mails/schedules", label: "予約一覧", variant: "secondary" },
        ]}
      />

      <SurfaceCard>
        <SectionTitle
          title="一覧サマリー"
          description="運用量と現在の作業対象を把握しやすくしました。"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatChip label="登録メール数" value={rows.length} />
          <StatChip
            label="予約あり"
            value={rows.filter((r) => deriveStatusFromDeliveries(byMail.get(r.id) ?? []) === "scheduled").length}
          />
          <StatChip
            label="送信待ち/処理中"
            value={rows.filter((r) => {
              const status = deriveStatusFromDeliveries(byMail.get(r.id) ?? []);
              return status === "queued" || status === "scheduled/queued";
            }).length}
          />
        </div>
      </SurfaceCard>

      <DataTableCard className="overflow-x-auto">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-[linear-gradient(180deg,#fbfbfc_0%,#f3f5f8_100%)] text-neutral-600">
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
                  <td className="px-3 py-3 font-medium text-neutral-950">{r.name ?? ""}</td>
                  <td className="px-3 py-3 text-neutral-600">
                    {r.subject ?? ""}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}>
                      {status}
                    </span>
                  </td>
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
      </DataTableCard>
    </PageMain>
  );
}
