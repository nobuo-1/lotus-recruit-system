// web/src/app/form-outreach/senders/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Sender = {
  id?: string;
  company_name: string;
  sender_name: string;
  sender_email: string;
  website_url?: string | null;
};

export default function SenderSettings() {
  const [s, setS] = useState<Sender>({
    company_name: "",
    sender_name: "",
    sender_email: "",
    website_url: "",
  });
  const [msg, setMsg] = useState("");

  const load = async () => {
    const res = await fetch("/api/form-outreach/senders", {
      cache: "no-store",
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "fetch failed");
    setS(j.row ?? s);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const res = await fetch("/api/form-outreach/senders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "save failed");
    setMsg("保存しました");
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900">
            送信元設定
          </h1>
          <p className="text-sm text-neutral-500">
            このテナントの送信元は 1 件のみ保持されます。
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4">
          <Field label="会社名">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.company_name}
              onChange={(e) => setS({ ...s, company_name: e.target.value })}
            />
          </Field>
          <Field label="担当者名">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.sender_name}
              onChange={(e) => setS({ ...s, sender_name: e.target.value })}
            />
          </Field>
          <Field label="メールアドレス">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.sender_email}
              onChange={(e) => setS({ ...s, sender_email: e.target.value })}
            />
          </Field>
          <Field label="WebサイトURL">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.website_url ?? ""}
              onChange={(e) => setS({ ...s, website_url: e.target.value })}
            />
          </Field>

          <div className="mt-3">
            <button
              onClick={save}
              className="rounded-lg px-3 py-2 border border-neutral-200 hover:bg-neutral-50"
            >
              保存
            </button>
            {msg && (
              <span className="ml-3 text-xs text-neutral-500">{msg}</span>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs text-neutral-600 mb-1">{label}</div>
      {children}
    </div>
  );
}
