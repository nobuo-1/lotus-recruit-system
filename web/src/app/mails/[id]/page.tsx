// web/src/app/mails/[id]/page.tsx
import React from "react";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

type ScheduleRow = {
  scheduled_at: string | null;
  status: string | null;
};

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

type AttachmentRow = {
  id: string;
  file_name: string | null;
  file_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at?: string | null;
};

function toS(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// 文字列JSON/配列/オブジェクトの混在に耐える正規化（「大（小）」）
function normalizeJobsFlexible(
  rec: NonNullable<DeliveryRow["recipients"]>
): string[] {
  const raw = rec?.job_categories;
  const L1 = toS(rec?.job_category_large).trim();
  const S1 = toS(rec?.job_category_small).trim();
  const fallback =
    L1 || S1
      ? [`${L1}${L1 && S1 ? "（" : ""}${S1}${L1 && S1 ? "）" : ""}`]
      : [];

  if (!Array.isArray(raw) || raw.length === 0) return fallback;

  const toPretty = (x: unknown): string => {
    if (typeof x === "string") {
      const s = x.trim();
      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          const j = JSON.parse(s);
          if (Array.isArray(j))
            return j.map(toPretty).filter(Boolean).join(" / ");
          if (j && typeof j === "object") {
            const ll = toS((j as any).large).trim();
            const ss = toS((j as any).small).trim();
            return ll && ss ? `${ll}（${ss}）` : ll || ss || "";
          }
        } catch {
          /* treat as plain string */
        }
      }
      return s;
    }
    if (x && typeof x === "object") {
      const ll = toS((x as any).large).trim();
      const ss = toS((x as any).small).trim();
      return ll && ss ? `${ll}（${ss}）` : ll || ss || "";
    }
    return "";
  };

  const arr = raw.map(toPretty).filter(Boolean);
  return arr.length > 0 ? arr : fallback;
}

function deriveStatus(schedules: ScheduleRow[], deliveries: DeliveryRow[]) {
  const now = Date.now();
  const hasFuture =
    schedules?.some(
      (s) =>
        s.scheduled_at &&
        s.status !== "cancelled" &&
        Date.parse(s.scheduled_at) > now
    ) ?? false;
  const dStatuses = (deliveries ?? []).map((d) =>
    String(d.status ?? "").toLowerCase()
  );
  const hasQueued = dStatuses.some((s) => s === "queued" || s === "processing");
  const hasSent = dStatuses.some((s) => s === "sent");
  if (hasFuture && hasSent) return "scheduled/partial";
  if (hasFuture) return "scheduled";
  if (hasQueued) return "queued";
  if (hasSent) return "sent";
  return "draft";
}

export default async function MailDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const supabase = await supabaseServer();

  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p>ログインが必要です</p>
      </main>
    );
  }

  // メール本体：body_html を一切参照しない（列が無い環境でも安全）
  const { data: mail, error: mailErr } = await supabase
    .from("mails")
    .select("id, name, subject, created_at, body_text")
    .eq("id", id)
    .maybeSingle();

  if (mailErr || !mail) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-red-600">
          メールが見つかりません: {mailErr?.message}
        </p>
      </main>
    );
  }

  // 予約情報
  const { data: schedules } = await supabase
    .from("mail_schedules")
    .select("scheduled_at, status")
    .eq("mail_id", id)
    .returns<ScheduleRow[]>();

  // 配信先
  const { data: deliveries } = await supabase
    .from("mail_deliveries")
    .select(
      "recipient_id, status, sent_at, recipients(name, email, region, gender, job_category_large, job_category_small, job_categories)"
    )
    .eq("mail_id", id)
    .order("sent_at", { ascending: false })
    .returns<DeliveryRow[]>();

  // 添付一覧
  const { data: atts } = await supabase
    .from("mail_attachments")
    .select("id,file_name,file_path,mime_type,size_bytes,created_at")
    .eq("mail_id", id)
    .order("created_at", { ascending: true })
    .returns<AttachmentRow[]>();

  const rows = deliveries ?? [];
  const sentCount = rows.length;
  const statusText = deriveStatus(schedules ?? [], rows);

  // 本文：body_text のみ
  const bodyText = toS(mail?.body_text);

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
          {/* ▼ 追加：メール予約リストへ */}
          <Link
            href="/mails/schedules"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            メール予約リスト
          </Link>
          {/* ▲ 追加ここまで */}
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
            <div className="text-neutral-900">{statusText}</div>
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

      {/* 添付ファイル一覧 */}
      <section className="mt-8 rounded-2xl border border-neutral-200 p-4">
        <div className="mb-2 text-sm text-neutral-500">添付ファイル</div>
        {(atts ?? []).length ? (
          <ul className="list-disc pl-5 text-sm text-neutral-800">
            {(atts ?? []).map((a) => (
              <li key={a.id} className="leading-6">
                {a.file_name ?? "(名称未設定)"}{" "}
                <span className="text-neutral-400">
                  {a.size_bytes != null ? `(${a.size_bytes} bytes)` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-neutral-400 text-sm">添付はありません</div>
        )}
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
              {rows.map((r) => {
                const rec = r.recipients ?? null;
                const jobs = rec ? normalizeJobsFlexible(rec) : [];
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
              {rows.length === 0 && (
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
