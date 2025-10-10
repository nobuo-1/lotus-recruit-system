import React from "react";
import { supabaseServer } from "@/lib/supabaseServer";
import Link from "next/link";
import { formatJpDateTime } from "@/lib/formatDate";

export default async function CampaignDetailPage({
  // Next.js 15: params は Promise
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();

  // 認証 + テナント
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

  // キャンペーン
  const { data: camp } = await supabase
    .from("campaigns")
    .select("id, name, subject, body_html, status, created_at")
    .eq("id", id)
    .maybeSingle();

  // 送信先一覧（deliveries 経由で recipients をJOIN）
  const { data: rows } = await supabase
    .from("deliveries")
    .select(
      "recipient_id, status, sent_at, recipients(name, email, region, gender, job_category_large, job_category_small)"
    )
    .eq("campaign_id", id)
    .order("sent_at", { ascending: false });

  const sentCount = rows?.length ?? 0;
  const buttonLabel = sentCount === 0 ? "配信" : "再配信";

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            キャンペーン詳細
          </h1>
          <p className="text-sm text-neutral-500">
            送信内容と送信先を確認できます
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/campaigns/${id}/send`}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            {buttonLabel}
          </Link>
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            一覧に戻る
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-200 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm text-neutral-500">名前</div>
            <div className="text-neutral-900">{camp?.name ?? "-"}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">件名</div>
            <div className="text-neutral-900">{camp?.subject ?? "-"}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">ステータス</div>
            <div className="text-neutral-900">{camp?.status ?? "-"}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">作成日</div>
            <div className="text-neutral-900">
              {formatJpDateTime(camp?.created_at)}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-neutral-500">本文（HTML）</div>
            <input
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
              defaultValue={camp?.body_html ?? ""}
              readOnly
            />
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-neutral-200">
        <div className="px-4 py-3 text-neutral-700">
          送信先一覧（{sentCount} 件）
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名前</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-center">都道府県</th>
                <th className="px-3 py-3 text-center">性別</th>
                <th className="px-3 py-3 text-center">職種</th>
                <th className="px-3 py-3 text-center">送信ステータス</th>
                <th className="px-3 py-3 text-left">送信日時</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => {
                const rec = r.recipients ?? {};
                const L = (rec.job_category_large ?? "").trim();
                const S = (rec.job_category_small ?? "").trim();
                const job = L && S ? `${L}（${S}）` : L || S || "";
                return (
                  <tr
                    key={r.recipient_id}
                    className="border-t border-neutral-200"
                  >
                    <td className="px-3 py-3">{rec.name ?? ""}</td>
                    <td className="px-3 py-3 text-neutral-600">
                      {rec.email ?? ""}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {rec.region ?? ""}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {rec.gender === "male"
                        ? "男性"
                        : rec.gender === "female"
                        ? "女性"
                        : ""}
                    </td>
                    <td className="px-3 py-3 text-center">{job}</td>
                    <td className="px-3 py-3 text-center">{r.status ?? ""}</td>
                    <td className="px-3 py-3">{formatJpDateTime(r.sent_at)}</td>
                  </tr>
                );
              })}
              {(rows ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    送信実績はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
