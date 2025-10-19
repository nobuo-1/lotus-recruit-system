import React from "react";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

type DeliveryRow = {
  recipient_id: string;
  status: string | null;
  sent_at: string | null;
  recipients: {
    name: string | null;
    email: string | null;
    region: string | null;
    gender: "male" | "female" | null;
    job_category_large: string | null;
    job_category_small: string | null;
    job_categories?: Array<
      string | { large?: unknown; small?: unknown }
    > | null;
  } | null;
};

function toS(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalizeJobs(rec: NonNullable<DeliveryRow["recipients"]>): string[] {
  const toStr = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = rec?.job_categories;

  if (Array.isArray(arr) && arr.length > 0) {
    return arr
      .map((it) => {
        if (typeof it === "string") return toStr(it);
        if (it && typeof it === "object") {
          const L = toStr((it as any).large);
          const S = toStr((it as any).small);
          return L && S ? `${L}（${S}）` : L || S || "";
        }
        return "";
      })
      .filter(Boolean);
  }

  const L = toStr(rec?.job_category_large);
  const S = toStr(rec?.job_category_small);
  return L || S ? [L && S ? `${L}（${S}）` : L || S] : [];
}

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

  // 本体
  const { data: mail } = await supabase
    .from("mails")
    .select(
      "id, name, subject, status, created_at, from_email, body_text, body_html"
    )
    .eq("id", id)
    .maybeSingle();

  // 配信先
  const { data: rows } = await supabase
    .from("mail_deliveries")
    .select(
      "recipient_id, status, sent_at, recipients(name, email, region, gender, job_category_large, job_category_small, job_categories)"
    )
    .eq("mail_id", id)
    .order("sent_at", { ascending: false })
    .returns<DeliveryRow[]>();

  const sentCount = rows?.length ?? 0;

  // 本文は body_text を優先、なければ HTML をテキスト化
  const bodyText =
    toS(mail?.body_text) ||
    toS(mail?.body_html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .trim();

  return (
    <main className="mx-auto max-w-6xl p-6">
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
            メール一覧へ
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-200 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm text-neutral-500">名前</div>
            <div className="text-neutral-900">{toS(mail?.name) || "-"}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">件名</div>
            <div className="text-neutral-900">{toS(mail?.subject) || "-"}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">ステータス</div>
            <div className="text-neutral-900">{toS(mail?.status) || "-"}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">作成日</div>
            <div className="text-neutral-900">
              {formatJpDateTime(mail?.created_at)}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-neutral-500">本文（テキスト）</div>
            <textarea
              className="mt-1 w-full min-h-[220px] rounded-xl border border-neutral-200 px-3 py-2"
              defaultValue={bodyText || "-"}
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
              {(rows ?? []).map((r) => {
                const rec = r.recipients ?? null;
                const jobs = rec ? normalizeJobs(rec) : [];
                return (
                  <tr
                    key={r.recipient_id}
                    className="border-t border-neutral-200"
                  >
                    <td className="px-3 py-3">{toS(rec?.name)}</td>
                    <td className="px-3 py-3 text-neutral-600 whitespace-nowrap">
                      {toS(rec?.email)}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {toS(rec?.region)}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {rec?.gender === "male"
                        ? "男性"
                        : rec?.gender === "female"
                        ? "女性"
                        : ""}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-pre-line text-neutral-600">
                      {jobs.length ? jobs.join("\n") : ""}
                    </td>
                    <td className="px-3 py-3 text-center">{toS(r.status)}</td>
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
