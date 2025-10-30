// web/src/app/email/settings/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";
import { toastSuccess, toastError } from "@/components/AppToast";

// 非SSRで読み込み（CSR専用）
const RecipientListSettingsForm = dynamic(
  () => import("./RecipientListSettingsForm"),
  { ssr: false }
);

type Form = {
  company_name: string;
  company_address: string;
  support_email: string;
  from_email: string;
};

export default function EmailSettingsPage() {
  const [form, setForm] = useState<Form>({
    company_name: "",
    company_address: "",
    support_email: "",
    from_email: "",
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/settings", { cache: "no-store" });
        const j = await res.json();
        setForm({
          company_name: j?.company_name ?? "",
          company_address: j?.company_address ?? "",
          support_email: j?.support_email ?? "",
          from_email: j?.from_email ?? "",
        });
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/email/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const t = await res.text();
    setMsg(`${res.status}: ${t}`);
    if (res.ok) toastSuccess("保存しました");
    else toastError(`保存に失敗しました（${res.status}）`);
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-3xl p-6">
        {/* ヘッダー行 */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
              メール用設定
            </h1>
            <p className="text-sm text-neutral-500">
              メールフッターの会社名/住所/問い合わせ先、差出人メールを設定します
            </p>
          </div>
          <Link
            href="/email"
            className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 whitespace-nowrap"
          >
            メール配信トップ
          </Link>
        </div>

        {/* 会社情報フォーム（既存） */}
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-neutral-200 p-4"
        >
          <div>
            <label className="block text-sm text-neutral-600">会社名</label>
            <input
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
              value={form.company_name}
              onChange={(e) =>
                setForm({ ...form, company_name: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-600">住所</label>
            <input
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
              value={form.company_address}
              onChange={(e) =>
                setForm({ ...form, company_address: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-600">
              お問い合わせ先メール
            </label>
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
              value={form.support_email}
              onChange={(e) =>
                setForm({ ...form, support_email: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-600">
              差出人メール
            </label>
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
              value={form.from_email}
              onChange={(e) => setForm({ ...form, from_email: e.target.value })}
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
            >
              保存
            </button>
          </div>
        </form>

        {/* ▼ 受信者リストの表示列（新規セクション） */}
        <div className="mt-8 rounded-2xl border border-neutral-200 p-4">
          <h2 className="mb-2 text-lg font-semibold">受信者リストの表示列</h2>
          <p className="mb-3 text-sm text-neutral-500">
            チェックした項目だけが「受信者リスト」の列とフィルターに出ます。
            会社名や職種（複数）も選択できます。
          </p>
          <RecipientListSettingsForm />
        </div>

        <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
      </main>
    </>
  );
}
