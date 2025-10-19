import React from "react";
import { supabaseServer } from "@/lib/supabaseServer";
import Link from "next/link";
import { formatJpDateTime } from "@/lib/formatDate";

/** 受信者リスト設定キー */
type RecipientColumnKey =
  | "name"
  | "company_name"
  | "job_categories"
  | "gender"
  | "age"
  | "created_at"
  | "email"
  | "region"
  | "phone";

const DEFAULT_VISIBLE: RecipientColumnKey[] = [
  "name",
  "company_name",
  "job_categories",
  "email",
  "region",
  "created_at",
];

// このページで扱う列の順序（ONのものだけ表示）
const PAGE_ORDER: RecipientColumnKey[] = [
  "name",
  "email",
  "region",
  "gender",
  "job_categories",
];

const toS = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: camp } = await supabase
    .from("campaigns")
    .select("id, name, subject, body_html, status, created_at")
    .eq("id", id)
    .maybeSingle();

  // 可視列設定の取得
  let visibleCols = DEFAULT_VISIBLE;
  if (tenantId) {
    const { data: setting } = await supabase
      .from("recipient_list_settings")
      .select("visible_columns")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (
      Array.isArray(setting?.visible_columns) &&
      setting!.visible_columns.length
    ) {
      visibleCols = setting!.visible_columns as RecipientColumnKey[];
    }
  }
  const orderedVisible = PAGE_ORDER.filter((k) => visibleCols.includes(k));

  const { data: rows } = await supabase
    .from("deliveries")
    .select(
      // job_categories がある場合は拾う（後方互換で大/小も取得）
      "recipient_id, status, sent_at, recipients(name, email, region, gender, job_category_large, job_category_small, job_categories)"
    )
    .eq("campaign_id", id)
    .order("sent_at", { ascending: false });

  const sentCount = rows?.length ?? 0;
  const buttonLabel = sentCount === 0 ? "配信" : "再配信";

  const normalizeJobs = (rec: any): string[] => {
    const jc = rec?.job_categories;
    if (Array.isArray(jc) && jc.length) {
      return jc
        .map((it) => {
          if (typeof it === "string") return toS(it);
          if (it && typeof it === "object") {
            const L = toS(it.large);
            const S = toS(it.small);
            return L && S ? `${L}（${S}）` : L || S || "";
          }
          return "";
        })
        .filter(Boolean);
    }
    const L = toS(rec?.job_category_large);
    const S = toS(rec?.job_category_small);
    return L || S ? [L && S ? `${L}（${S}）` : L || S] : [];
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* ヘッダー */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            キャンペーン詳細
          </h1>
          <p className="text-sm text-neutral-500">
            送信内容と送信先を確認できます
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href={`/campaigns/${id}/send`}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            {buttonLabel}
          </Link>
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
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
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                {orderedVisible.includes("name") && (
                  <th className="px-3 py-3 text-left">名前</th>
                )}
                {orderedVisible.includes("email") && (
                  <th className="px-3 py-3 text-left">メール</th>
                )}
                {orderedVisible.includes("region") && (
                  <th className="px-3 py-3 text-center">都道府県</th>
                )}
                {orderedVisible.includes("gender") && (
                  <th className="px-3 py-3 text-center">性別</th>
                )}
                {orderedVisible.includes("job_categories") && (
                  <th className="px-3 py-3 text-center">職種</th>
                )}
                {/* 固有列は常時表示 */}
                <th className="px-3 py-3 text-center">送信ステータス</th>
                <th className="px-3 py-3 text-left">送信日時</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => {
                const rec = r.recipients ?? {};
                const jobs = normalizeJobs(rec);

                return (
                  <tr
                    key={r.recipient_id}
                    className="border-t border-neutral-200"
                  >
                    {orderedVisible.includes("name") && (
                      <td className="px-3 py-3">{rec.name ?? ""}</td>
                    )}
                    {orderedVisible.includes("email") && (
                      <td className="px-3 py-3 text-neutral-600 whitespace-nowrap">
                        {rec.email ?? ""}
                      </td>
                    )}
                    {orderedVisible.includes("region") && (
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {rec.region ?? ""}
                      </td>
                    )}
                    {orderedVisible.includes("gender") && (
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {rec.gender === "male"
                          ? "男性"
                          : rec.gender === "female"
                          ? "女性"
                          : ""}
                      </td>
                    )}
                    {orderedVisible.includes("job_categories") && (
                      <td className="px-3 py-3 text-center">
                        <div className="text-neutral-600 leading-5 whitespace-pre-line">
                          {jobs.length ? jobs.join("\n") : ""}
                        </div>
                      </td>
                    )}

                    {/* 固有列 */}
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
