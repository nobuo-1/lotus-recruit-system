// web/src/app/job-boards/destinations/new/page.tsx
"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Toggle from "@/components/Toggle";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type DestType = "email" | "webhook" | "slack";

export default function NewDestinationPage() {
  // ✅ useSearchParams を使うクライアント部品を Suspense でラップ
  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-3xl p-6">
        <Suspense
          fallback={
            <section className="rounded-2xl border border-neutral-200 p-4 text-sm text-neutral-500">
              読み込み中…
            </section>
          }
        >
          <NewDestinationInner />
        </Suspense>
      </main>
    </>
  );
}

function NewDestinationInner() {
  const router = useRouter();
  const params = useSearchParams();

  // クエリの ?type= で初期値を指定可能
  const initialType = useMemo<DestType>(() => {
    const t = (params.get("type") || "").toLowerCase();
    return (["email", "webhook", "slack"] as const).includes(t as any)
      ? (t as DestType)
      : "email";
  }, [params]);

  const [name, setName] = useState("");
  const [type, setType] = useState<DestType>(initialType);
  const [value, setValue] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [msg, setMsg] = useState("");

  const placeholder = useMemo(() => {
    switch (type) {
      case "email":
        return "例）alerts@example.com";
      case "webhook":
        return "例）https://example.com/webhook";
      case "slack":
        return "例）#alerts もしくは Webhook URL";
      default:
        return "";
    }
  }, [type]);

  const save = async () => {
    setMsg("");
    try {
      const res = await fetch("/api/job-boards/destinations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": TENANT_ID, // ✅ ヘッダでテナント指定
        },
        body: JSON.stringify({
          name: name.trim(),
          type,
          value: value.trim(),
          enabled,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "保存に失敗しました");
      router.push("/job-boards/destinations");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  return (
    <section className="rounded-2xl border border-neutral-200 p-4">
      <div className="mb-4 flex items-end justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">
          送り先を追加
        </h1>
      </div>

      <Field label="名称">
        <input
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例）営業向け通知"
        />
      </Field>

      <Field label="タイプ">
        <div className="flex flex-wrap gap-2">
          {(["email", "webhook", "slack"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`text-xs rounded-full border px-3 py-1 ${
                type === t
                  ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                  : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {t === "email" ? "メール" : t === "webhook" ? "Webhook" : "Slack"}
            </button>
          ))}
        </div>
      </Field>

      <Field label="送り先（値）">
        <input
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
        />
        <p className="mt-1 text-xs text-neutral-500">
          タイプに応じて、メールアドレス／Webhook URL／Slack
          チャンネル名やURLを指定します。
        </p>
      </Field>

      <Field label="有効">
        <Toggle checked={enabled} onChange={setEnabled} />
      </Field>

      <div className="pt-2">
        <button
          onClick={save}
          className="rounded-lg border border-neutral-200 px-3 py-2 hover:bg-neutral-50"
        >
          追加する
        </button>
        {msg && <span className="ml-3 text-xs text-red-600">{msg}</span>}
      </div>
    </section>
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
      <div className="mb-1 text-xs text-neutral-600">{label}</div>
      {children}
    </div>
  );
}
