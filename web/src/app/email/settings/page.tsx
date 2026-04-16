// web/src/app/email/settings/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";
import { toastSuccess, toastError } from "@/components/AppToast";
import { PageHero, PageMain, SurfaceCard } from "@/components/PageChrome";

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
      <PageMain className="max-w-5xl space-y-6">
        <PageHero
          eyebrow="Mail Settings"
          title="メール配信の設定を統一 UI で管理"
          description="会社情報、問い合わせ先、差出人メール、受信者リストの表示列を同じトーンのカードに整理しました。"
          accent="blue"
        />

        <SurfaceCard>
        <form
          onSubmit={onSubmit}
          className="space-y-4"
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
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="mb-2 text-lg font-semibold">受信者リストの表示列</h2>
          <p className="mb-3 text-sm text-neutral-500">
            チェックした項目だけが「受信者リスト」の列とフィルターに出ます。
            会社名や職種（複数）も選択できます。
          </p>
          <RecipientListSettingsForm />
        </SurfaceCard>

        <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
      </PageMain>
    </>
  );
}
