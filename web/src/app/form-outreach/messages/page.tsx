// web/src/app/form-outreach/messages/page.tsx
import React from "react";
import AppHeader from "@/components/AppHeader";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type Tpl = {
  id: string;
  name: string;
  body_text: string;
  created_at: string | null;
};

export default async function TemplatesPage() {
  const sb = await supabaseServer();
  let rows: Tpl[] = [];
  try {
    const { data } = await sb
      .from("form_outreach_messages")
      .select("id, name, body_text, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<Tpl[]>();
    rows = data ?? [];
  } catch {}

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">
            メッセージテンプレート
          </h1>
          <p className="text-sm text-neutral-500">一覧・編集（後日拡張）</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">名称</th>
                <th className="px-3 py-3 text-left">本文</th>
                <th className="px-3 py-3 text-left">作成日</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {r.body_text?.slice(0, 80) ?? ""}
                  </td>
                  <td className="px-3 py-2">{r.created_at ?? "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    テンプレートがありません
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
