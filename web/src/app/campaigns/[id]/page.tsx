import React from "react";
import { supabaseServer } from "@/lib/supabaseServer";
import Link from "next/link";
import { formatJpDateTime } from "@/lib/formatDate";

// 表示列キー（受信者リスト設定）
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
  "email",
  "region",
  "gender",
  "job_categories",
];

// JSON/オブジェクト/ラベル → 「大(小)」
const jobLabelFromAny = (it: unknown): string => {
  const toS = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (typeof it === "string") {
    const s = it.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      try {
        const o = JSON.parse(s);
        const L = toS(o?.large);
        const S = toS(o?.small);
        return L && S ? `${L}(${S})` : L || S || "";
      } catch {
        return s;
      }
    }
    return s;
  }
  if (it && typeof it === "object") {
    const any = it as any;
    const L = toS(any?.large);
    const S = toS(any?.small);
    return L && S ? `${L}(${S})` : L || S || "";
  }
  return "";
};

const normalizeJobs = (rec: any): string[] => {
  const jc = rec?.job_categories;
  if (Array.isArray(jc) && jc.length) {
    return jc.map(jobLabelFromAny).filter(Boolean);
  }
  const L = (rec?.job_category_large ?? "").trim();
  const S = (rec?.job_category_small ?? "").trim();
  return L || S ? [L && S ? `${L}(${S})` : L || S] : [];
};

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

  // tenant & 可視列
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = prof?.tenant_id as string | undefined;

  let visible = DEFAULT_VISIBLE;
  if (tenantId) {
    const { data: setting } = await supabase
      .from("recipient_list_settings")
      .select("visible_columns")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const cols = (setting?.visible_columns ?? []) as RecipientColumnKey[];
    if (Array.isArray(cols) && cols.length) visible = cols;
  }

  const { data: camp } = await supabase
    .from("campaigns")
    .select("id, name, subject, body_html, status, created_at")
    .eq("id", id)
    .maybeSingle();

  // 送信先（受信者の複数職種も一緒に取得）
  const { data: rows } = await supabase
    .from("deliveries")
    .select(
      "recipient_id, status, sent_at, recipients(name, email, region, gender, job_category_large, job_category_small, job_categories)"
    )
    .eq("campaign_id", id)
    .order("sent_at", { ascending: false });

  const sentCount = rows?.length ?? 0;
  const buttonLabel = sentCount === 0 ? "配信" : "再配信";

  // このページで扱う列のうち、設定で可視のものだけ表示（送信ステータス/送信日時は常時表示）
  const DISPLAY_ORDER: RecipientColumnKey[] = [
    "name",
    "email",
    "region",
    "gender",
    "job_categories",
  ];
  const orderedVisible = DISPLAY_ORDER.filter((k) => visible.includes(k));

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* ヘッダー：スマホ縦積み */}
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
                {orderedVisible.map((k) => (
                  <th
                    key={k}
                    className={`px-3 py-3 ${
                      k === "gender" || k === "region" || k === "job_categories"
                        ? "text-center"
                        : "text-left"
                    }`}
                  >
                    {
                      {
                        name: "名前",
                        company_name: "会社名",
                        email: "メール",
                        phone: "電話",
                        age: "年齢",
                        region: "都道府県",
                        gender: "性別",
                        job_categories: "職種",
                        created_at: "作成日",
                      }[k] as string
                    }
                  </th>
                ))}
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
                    {orderedVisible.map((k) => {
                      switch (k) {
                        case "name":
                          return (
                            <td key={k} className="px-3 py-3">
                              {rec.name ?? ""}
                            </td>
                          );
                        case "email":
                          return (
                            <td
                              key={k}
                              className="px-3 py-3 text-neutral-600 whitespace-nowrap"
                            >
                              {rec.email ?? ""}
                            </td>
                          );
                        case "region":
                          return (
                            <td
                              key={k}
                              className="px-3 py-3 text-center whitespace-nowrap"
                            >
                              {rec.region ?? ""}
                            </td>
                          );
                        case "gender":
                          return (
                            <td
                              key={k}
                              className="px-3 py-3 text-center whitespace-nowrap"
                            >
                              {rec.gender === "male"
                                ? "男性"
                                : rec.gender === "female"
                                ? "女性"
                                : ""}
                            </td>
                          );
                        case "job_categories":
                          return (
                            <td key={k} className="px-3 py-3 text-center">
                              <div className="text-neutral-600 leading-5 whitespace-pre-line">
                                {jobs.join("\n")}
                              </div>
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}
                    <td className="px-3 py-3 text-center">{r.status ?? ""}</td>
                    <td className="px-3 py-3">{formatJpDateTime(r.sent_at)}</td>
                  </tr>
                );
              })}
              {(rows ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={orderedVisible.length + 2}
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
