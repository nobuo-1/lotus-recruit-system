// web/src/app/job-boards/settings/page.tsx
import React from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { supabaseServer } from "@/lib/supabaseServer";

type Rule = {
  id: string;
  tenant_id: string | null;
  name?: string | null;
  title?: string | null;
  rule_name?: string | null;
  sites?: string[] | null;
  large_categories?: string[] | null;
  small_categories?: string[] | null;
  age_bands?: string[] | null;
  employment_types?: string[] | null;
  salary_bands?: string[] | null;
  frequency?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

export const dynamic = "force-dynamic";

export default async function JBSettingsPage() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
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
  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = prof?.tenant_id as string | undefined;

  const { data: rules, error } = await sb
    .from("job_board_notify_rules")
    .select(
      "id, tenant_id, name, title, rule_name, sites, large_categories, small_categories, age_bands, employment_types, salary_bands, frequency, is_active, created_at"
    )
    .eq("tenant_id", tenantId!);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-[26px] md:text-[24px] font-extrabold tracking-tight text-indigo-900">
              通知設定
            </h1>
            <p className="text-sm text-neutral-500">通知ルールの一覧と編集</p>
          </div>
          <Link
            href="/job-boards/settings/new"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            新規通知ルール
          </Link>
        </div>

        {error && <p className="text-red-600 text-sm mb-3">{error.message}</p>}

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">頻度</th>
                <th className="px-3 py-3 text-left">状態</th>
                <th className="px-3 py-3 text-left">作成日</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {(rules ?? []).map((r) => {
                const title =
                  (r.name || r.title || r.rule_name || "").trim() || "(無題)";
                const sites = (r.sites ?? []).join(", ");
                const freq = r.frequency ?? "-";
                const status = r.is_active ? "active" : "inactive";
                return (
                  <tr key={r.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3">{title}</td>
                    <td className="px-3 py-3">{sites || "すべて"}</td>
                    <td className="px-3 py-3">{freq}</td>
                    <td className="px-3 py-3">{status}</td>
                    <td className="px-3 py-3">{r.created_at ?? ""}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/job-boards/settings/${r.id}`}
                          className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                        >
                          詳細
                        </Link>
                        <Link
                          href={`/job-boards/settings/${r.id}/edit`}
                          className="rounded-xl border border-neutral-200 px-3 py-1 hover:bg-neutral-50 whitespace-nowrap"
                        >
                          編集
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(rules ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    通知ルールはありません
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
