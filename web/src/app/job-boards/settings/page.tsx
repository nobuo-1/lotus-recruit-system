// web/src/app/job-boards/settings/page.tsx
import React from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatJpDateTime } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

type NotifyRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  is_active: boolean | null;
  sites: string[] | null;
  large_categories: string[] | null;
  small_categories: string[] | null;
  age_bands: string[] | null;
  employment_types: string[] | null;
  salary_bands: string[] | null;
  frequency: string | null; // e.g. daily / weekly / monthly
  deliver_to: string[] | null; // emails / webhook url 等
  created_at: string | null;
  updated_at?: string | null;
};

export default async function JobBoardSettingsPage() {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return (
      <>
        <AppHeader showBack />
        <main className="mx-auto max-w-6xl p-6">
          <p className="text-red-600">ログインが必要です。</p>
        </main>
      </>
    );
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = prof?.tenant_id as string | undefined;

  const { data: rows, error } = await supabase
    .from("job_board_notify_rules")
    .select(
      "id, tenant_id, name, is_active, sites, large_categories, small_categories, age_bands, employment_types, salary_bands, frequency, deliver_to, created_at, updated_at"
    )
    .eq("tenant_id", tenantId ?? "")
    .order("created_at", { ascending: false })
    .returns<NotifyRow[]>();

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              通知設定
            </h1>
            <p className="text-sm text-neutral-500">
              しきい値・頻度・届け先をまとめて管理します
            </p>
          </div>
          <Link
            href="/job-boards/settings/new"
            className="rounded-xl border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            ＋ 新規通知ルール
          </Link>
        </div>

        {/* ▼ “表のみ” 表示（入れ子のカードは廃止） */}
        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">ルール名</th>
                <th className="px-3 py-3 text-left">状態</th>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">職種(大/小)</th>
                <th className="px-3 py-3 text-left">年齢/雇用/年収</th>
                <th className="px-3 py-3 text-left">頻度</th>
                <th className="px-3 py-3 text-left">届け先</th>
                <th className="px-3 py-3 text-left">作成日</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-red-600">
                    {error.message}
                  </td>
                </tr>
              ) : (rows ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    通知ルールはありません
                  </td>
                </tr>
              ) : (
                (rows ?? []).map((r) => {
                  const sites =
                    (r.sites ?? []).length > 0
                      ? (r.sites ?? []).join(", ")
                      : "すべて";
                  const lg =
                    (r.large_categories ?? []).length > 0
                      ? (r.large_categories ?? []).join(" / ")
                      : "すべて";
                  const sm =
                    (r.small_categories ?? []).length > 0
                      ? (r.small_categories ?? []).join(", ")
                      : "すべて";
                  const age =
                    (r.age_bands ?? []).length > 0
                      ? (r.age_bands ?? []).join(", ")
                      : "すべて";
                  const emp =
                    (r.employment_types ?? []).length > 0
                      ? (r.employment_types ?? []).join(", ")
                      : "すべて";
                  const sal =
                    (r.salary_bands ?? []).length > 0
                      ? (r.salary_bands ?? []).join(", ")
                      : "すべて";
                  const sendTo =
                    (r.deliver_to ?? []).length > 0
                      ? (r.deliver_to ?? []).join(", ")
                      : "-";
                  return (
                    <tr key={r.id} className="border-t border-neutral-200">
                      <td className="px-3 py-3">{r.name ?? ""}</td>
                      <td className="px-3 py-3">
                        {r.is_active ?? false ? "アクティブ" : "停止中"}
                      </td>
                      <td className="px-3 py-3">{sites}</td>
                      <td className="px-3 py-3">
                        {lg}
                        <br />
                        <span className="text-neutral-500">{sm}</span>
                      </td>
                      <td className="px-3 py-3">
                        年齢: {age}
                        <br />
                        雇用: {emp}
                        <br />
                        年収: {sal}
                      </td>
                      <td className="px-3 py-3">{r.frequency ?? "-"}</td>
                      <td className="px-3 py-3">{sendTo}</td>
                      <td className="px-3 py-3">
                        {formatJpDateTime(r.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <Link
                            href={`/job-boards/settings/${r.id}`}
                            className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                          >
                            編集
                          </Link>
                          <Link
                            href={`/job-boards/settings/${r.id}/delete`}
                            className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                          >
                            削除
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
