// web/src/app/form-outreach/senders/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Sender = {
  id?: string;
  sender_company?: string | null; // 追加：{{sender_company}} 用
  from_name: string; // {{sender_name}} 用（個人名など）
  from_email: string;
  reply_to?: string | null;
  phone?: string | null;
  website?: string | null;
  signature?: string | null;
  is_default: boolean;
};

export default function SenderSettings() {
  const [s, setS] = useState<Sender>({
    sender_company: "",
    from_name: "",
    from_email: "",
    reply_to: "",
    phone: "",
    website: "",
    signature: "",
    is_default: true,
  });
  const [msg, setMsg] = useState("");

  const load = async () => {
    const res = await fetch("/api/form-outreach/senders", {
      cache: "no-store",
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "fetch failed");
    setS(
      j.row ?? {
        sender_company: "",
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
      // sender_company を含めて保存
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
            <br />
            テンプレートの
            <code className="text-[11px]">
              {" {{sender_company}}, {{sender_name}} "}
            </code>
            に対応します。
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4">
          <Field label="会社名（sender_company：{{sender_company}} 用）">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.sender_company ?? ""}
              onChange={(e) =>
                setS({ ...s, sender_company: e.target.value || "" })
              }
              placeholder="例）株式会社LOTUS"
            />
          </Field>

          <Field label="送信者名（from_name：{{sender_name}} 用）">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.from_name ?? ""}
              onChange={(e) => setS({ ...s, from_name: e.target.value })}
              placeholder="例）営業部 山田太郎"
            />
          </Field>

          <Field label="送信メール（from_email）">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.from_email ?? ""}
              onChange={(e) => setS({ ...s, from_email: e.target.value })}
              placeholder="例）sales@example.com"
            />
          </Field>

          <Field label="Reply-To">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.reply_to ?? ""}
              onChange={(e) => setS({ ...s, reply_to: e.target.value })}
              placeholder="未設定なら from_email が使われる想定"
            />
          </Field>

          <Field label="電話番号">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.phone ?? ""}
              onChange={(e) => setS({ ...s, phone: e.target.value })}
              placeholder="例）03-1234-5678"
            />
          </Field>

          <Field label="WebサイトURL">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.website ?? ""}
              onChange={(e) => setS({ ...s, website: e.target.value })}
              placeholder="例）https://lotus.example.com"
            />
          </Field>

          <Field label="署名（signature）">
            <textarea
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              rows={6}
              value={s.signature ?? ""}
              onChange={(e) => setS({ ...s, signature: e.target.value })}
              placeholder={
                "―――――――――\n株式会社LOTUS\n営業部 山田\nhttps://lotus.example.com"
              }
            />
            <div className="mt-1 text-[11px] text-neutral-500">
              テンプレート内の <code>{"{{signature}}"}</code>{" "}
              のほか、本文末尾にも自動追記されます。
            </div>
          </Field>

          <div className="mt-3">
            <button
              onClick={save}
              className="rounded-lg px-3 py-2 border border-neutral-200 hover:bg-neutral-50 mr-2"
            >
              保存
            </button>
            {msg && (
              <span className="text-xs text-neutral-500 align-middle">
                {msg}
              </span>
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
