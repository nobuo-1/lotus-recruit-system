// web/src/app/form-outreach/senders/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Sender = {
  id?: string;
  from_name: string;
  from_email: string;
  reply_to?: string | null;
  phone?: string | null;
  website?: string | null;
  signature?: string | null;
  is_default: boolean;
};

export default function SenderSettings() {
  const [s, setS] = useState<Sender>({
    from_name: "",
    from_email: "",
    reply_to: "",
    phone: "",
    website: "",
    signature: "",
    is_fake: undefined as any,
  } as any);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const res = await fetch("/api/form-outreach/senders", {
      cache: "no-store",
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "fetch failed");
    setS(
      j.row ?? {
        from_name: "",
        from_email: "",
        reply_to: "",
        phone: "",
        website: "",
        signature: "",
        is_default: true,
      }
    );
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const res = await fetch("/api/form-outreach/senders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, is_default: true }),
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
            このテナントの送信元は 1 件（is_default=true）を編集します。
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4">
          <Field label="送信者名（from_name）">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.from_name ?? ""}
              onChange={(e) => setS({ ...s, from_name: e.target.value })}
            />
          </Field>
          <Field label="送信メール（from_email）">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.from_email ?? ""}
              onChange={(e) => setS({ ...s, from_email: e.target.value })}
            />
          </Field>
          <Field label="Reply-To">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.reply_to ?? ""}
              onChange={(e) => setS({ ...s, reply_to: e.target.value })}
            />
          </Field>
          <Field label="電話番号">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py 2 text-sm"
              value={s.phone ?? ""}
              onChange={(e) => setS({ ...s, phone: e.target.value })}
            />
          </Field>
          <Field label="WebサイトURL">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.website ?? ""}
              onChange={(e) => setS({ ...s, website: e.target.value })}
            />
          </Field>
          <Field label="署名（signature）">
            <textarea
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              rows={6}
              value={s.signature ?? ""}
              onChange={(e) => setS({ ...s, signature: e.target.value })}
            />
          </Field>
          <div className="mt-3">
            <button
              onClick={save}
              className="rounded-lg px 3 py-2 border border-neutral-200 hover:bg-neutral-50"
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
