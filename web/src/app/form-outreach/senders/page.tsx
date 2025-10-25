// web/src/app/form-outreach/senders/page.tsx
import React from "react";
import AppHeader from "@/components/AppHeader";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type Sender = {
  id: string;
  from_name: string | null;
  from_email: string | null;
  created_at: string | null;
};

export default async function SendersPage() {
  const sb = await supabaseServer();
  let rows: Sender[] = [];
  try {
    const { data } = await sb
      .from("form_outreach_senders")
      .select("id, from_name, from_email, created_at")
      .order("created_at", { ascending: false })
      .returns<Sender[]>();
    rows = data ?? [];
  } catch {}

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">
            送信元設定
          </h1>
          <p className="text-sm text-neutral-500">
            フォーム営業で使う From 名/メール
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[700px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">From 名</th>
                <th className="px-3 py-3 text-left">From メール</th>
                <th className="px-3 py-3 text-left">作成日</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{r.from_name ?? "-"}</td>
                  <td className="px-3 py-2">{r.from_email ?? "-"}</td>
                  <td className="px-3 py-2">{r.created_at ?? "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    送信元がありません
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
