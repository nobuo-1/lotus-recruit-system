import React from "react";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";

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

const toText = (v: any) => (v == null ? "" : String(v));

const normalizeJobs = (rec: any): string[] => {
  const L = toText(rec?.job_category_large).trim();
  const S = toText(rec?.job_category_small).trim();
  const one =
    L || S ? [`${L}${L && S ? "（" : ""}${S}${L && S ? "）" : ""}`] : [];

  const raw = rec?.job_categories;
  if (!Array.isArray(raw) || raw.length === 0) return one;

  const toS = (x: unknown): string => {
    if (typeof x === "string") {
      const s = x.trim();
      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          const j = JSON.parse(s);
          if (Array.isArray(j)) return j.map(toS).filter(Boolean).join(" / ");
          if (j && typeof j === "object") {
            const ll = toText((j as any).large).trim();
            const ss = toText((j as any).small).trim();
            return ll && ss ? `${ll}（${ss}）` : ll || ss || "";
          }
        } catch {
          /* as plain string */
        }
      }
      return s;
    }
    if (x && typeof x === "object") {
      const ll = toText((x as any).large).trim();
      const ss = toText((x as any).small).trim();
      return ll && ss ? `${ll}（${ss}）` : ll || ss || "";
    }
    return "";
  };

  return raw.map(toS).filter(Boolean);
};

export default async function MailDetailPage({
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

  const { data: mail } = await supabase
    .from("mails")
    .select("id, name, subject, body_text, body_html, status, created_at")
    .eq("id", id)
    .maybeSingle();

  // 表示列設定
  let visible = DEFAULT_VISIBLE;
  try {
    const { data: s } = await supabase
      .from("recipient_list_settings")
      .select("visible_columns")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const cols = (s?.visible_columns ?? []) as RecipientColumnKey[];
    if (Array.isArray(cols) && cols.length) visible = cols;
  } catch {
    /* no-op */
  }

  // 送信実績
  const { data: rows } = await supabase
    .from("mail_deliveries")
    .select(
      "recipient_id, status, sent_at, recipients(name, email, company_name, region, gender, job_category_large, job_category_small, job_categories)"
    )
    .eq("mail_id", id)
    .order("sent_at", { ascending: false });

  const textBody =
    toText(mail?.body_text) ||
    toText(mail?.body_html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  // このページで使う列（表示設定に追従）
  const baseCols = [
    "name",
    ...(visible.includes("company_name") ? (["company_name"] as const) : []),
    "email",
    ...(visible.includes("region") ? (["region"] as const) : []),
    ...(visible.includes("gender") ? (["gender"] as const) : []),
    ...(visible.includes("job_categories")
      ? (["job_categories"] as const)
      : []),
  ] as RecipientColumnKey[];

  const HEADERS: Record<RecipientColumnKey, string> = {
    name: "名前",
    company_name: "会社名",
    job_categories: "職種",
    gender: "性別",
    age: "年齢",
    created_at: "作成日",
    email: "メール",
    region: "都道府県",
    phone: "電話",
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* ヘッダー */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            メール詳細
          </h1>
          <p className="text-sm text-neutral-500">
            送信内容と送信先を確認できます
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href={`/mails/${id}/send`}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            送信
          </Link>
          <Link
            href="/mails"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            一覧に戻る
          </Link>
        </div>
      </div>

      {/* 本文など */}
      <section className="rounded-2xl border border-neutral-200 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm text-neutral-500">名前</div>
            <div className="text-neutral-900">{toText(mail?.name) || "-"}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">件名</div>
            <div className="text-neutral-900">
              {toText(mail?.subject) || "-"}
            </div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">ステータス</div>
            <div className="text-neutral-900">
              {toText(mail?.status) || "-"}
            </div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">作成日</div>
            <div className="text-neutral-900">
              {formatJpDateTime(mail?.created_at) || "-"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-neutral-500">本文（テキスト）</div>
            <textarea
              readOnly
              defaultValue={textBody || "-"}
              className="mt-1 w-full min-h-[160px] rounded-xl border border-neutral-200 px-3 py-2"
            />
          </div>
        </div>
      </section>

      {/* 送信先一覧 */}
      <section className="mt-8 rounded-2xl border border-neutral-200">
        <div className="px-4 py-3 text-neutral-700">
          送信先一覧（{rows?.length ?? 0} 件）
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                {baseCols.map((c) => (
                  <th
                    key={c}
                    className={`px-3 py-3 ${
                      c === "gender" || c === "region" || c === "job_categories"
                        ? "text-center"
                        : "text-left"
                    }`}
                  >
                    {HEADERS[c]}
                  </th>
                ))}
                <th className="px-3 py-3 text-center">送信ステータス</th>
                <th className="px-3 py-3 text-left">送信日時</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => {
                const rec = r?.recipients ?? {};
                const jobs = normalizeJobs(rec);
                return (
                  <tr
                    key={r.recipient_id}
                    className="border-t border-neutral-200"
                  >
                    {baseCols.map((c) => {
                      switch (c) {
                        case "name":
                          return (
                            <td key={c} className="px-3 py-3">
                              {toText(rec.name)}
                            </td>
                          );
                        case "company_name":
                          return (
                            <td key={c} className="px-3 py-3 text-neutral-700">
                              {toText(rec.company_name)}
                            </td>
                          );
                        case "email":
                          return (
                            <td
                              key={c}
                              className="px-3 py-3 text-neutral-600 whitespace-nowrap"
                            >
                              {toText(rec.email)}
                            </td>
                          );
                        case "region":
                          return (
                            <td
                              key={c}
                              className="px-3 py-3 text-center whitespace-nowrap text-neutral-600"
                            >
                              {toText(rec.region)}
                            </td>
                          );
                        case "gender":
                          return (
                            <td
                              key={c}
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
                            <td
                              key={c}
                              className="px-3 py-3 text-center text-neutral-600"
                            >
                              {jobs.length
                                ? jobs.map((s, i) => <div key={i}>{s}</div>)
                                : ""}
                            </td>
                          );
                        default:
                          return <td key={c} className="px-3 py-3" />;
                      }
                    })}
                    <td className="px-3 py-3 text-center">
                      {toText(r.status) || "-"}
                    </td>
                    <td className="px-3 py-3">
                      {formatJpDateTime(r.sent_at) || "-"}
                    </td>
                  </tr>
                );
              })}
              {(rows ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={baseCols.length + 2}
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
