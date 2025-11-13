// web/src/app/form-outreach/senders/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Sender = {
  id?: string;
  sender_company?: string | null; // 会社名（{{sender_company}})
  from_header_name?: string | null; // From: に表示する名前
  from_name: string; // 担当者名など（{{sender_name}})
  from_email: string;
  reply_to?: string | null;
  phone?: string | null;
  website?: string | null;
  signature?: string | null;

  // ★ フォーム営業用 住所系
  postal_code?: string | null;
  sender_prefecture?: string | null;
  sender_address?: string | null;
  sender_last_name?: string | null;
  sender_first_name?: string | null;

  is_default: boolean;
};

export default function SenderSettings() {
  const [s, setS] = useState<Sender>({
    sender_company: "",
    from_header_name: "",
    from_name: "",
    from_email: "",
    reply_to: "",
    phone: "",
    website: "",
    signature: "",
    postal_code: "",
    sender_prefecture: "",
    sender_address: "",
    sender_last_name: "",
    sender_first_name: "",
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
        from_header_name: "",
        from_name: "",
        from_email: "",
        reply_to: "",
        phone: "",
        website: "",
        signature: "",
        postal_code: "",
        sender_prefecture: "",
        sender_address: "",
        sender_last_name: "",
        sender_first_name: "",
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
          <Field label="会社名（{{sender_company}} 用）">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={s.sender_company ?? ""}
              onChange={(e) =>
                setS({ ...s, sender_company: e.target.value || "" })
              }
            />
          </Field>

          <Field label="From 表示名（メールの差出人に表示）">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              placeholder="例）LOTUS 採用DXチーム"
              value={s.from_header_name ?? ""}
              onChange={(e) =>
                setS({ ...s, from_header_name: e.target.value || "" })
              }
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              空の場合は「会社名 → 送信者名 → Lotus
              System」の優先順位で使用されます。
            </p>
          </Field>

          <Field label="送信者名（{{sender_name}} 用 / 個人名・担当者名）">
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
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
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

          <Field label="署名（{{signature}} 用テキスト）">
            <textarea
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              rows={6}
              value={s.signature ?? ""}
              onChange={(e) => setS({ ...s, signature: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              テンプレート本文内で <code>{"{{signature}}"}</code>{" "}
              を書いた場所にだけ、この署名が展開されます（自動で末尾には付きません）。
            </p>
          </Field>

          {/* ★ フォーム営業用 住所情報 */}
          <hr className="my-4 border-neutral-200" />
          <div className="text-xs font-semibold text-neutral-700 mb-2">
            フォーム営業用：送信者の住所情報
          </div>

          <Field label="郵便番号">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              placeholder="例）123-4567"
              value={s.postal_code ?? ""}
              onChange={(e) => setS({ ...s, postal_code: e.target.value })}
            />
          </Field>

          <Field label="都道府県">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              placeholder="例）大阪府"
              value={s.sender_prefecture ?? ""}
              onChange={(e) =>
                setS({ ...s, sender_prefecture: e.target.value })
              }
            />
          </Field>

          <Field label="住所（市区町村以降）">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              placeholder="例）大阪市〇〇区△△1-2-3 LOTUSビル3F"
              value={s.sender_address ?? ""}
              onChange={(e) => setS({ ...s, sender_address: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="姓（フォーム用）">
              <input
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                placeholder="例）山田"
                value={s.sender_last_name ?? ""}
                onChange={(e) =>
                  setS({ ...s, sender_last_name: e.target.value })
                }
              />
            </Field>
            <Field label="名（フォーム用）">
              <input
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                placeholder="例）太郎"
                value={s.sender_first_name ?? ""}
                onChange={(e) =>
                  setS({ ...s, sender_first_name: e.target.value })
                }
              />
            </Field>
          </div>

          <p className="mt-1 text-[11px] text-neutral-500">
            ※
            フォーム項目が「姓」「名」「郵便番号」などに分かれている場合、ChatGPT
            にこの情報を渡して自動入力に使用します。
          </p>

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
