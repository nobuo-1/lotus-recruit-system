"use client";
import { useEffect, useState } from "react";

type Settings = { from_email?: string; brand_name?: string; reply_to?: string };

export default function Client() {
  const [data, setData] = useState<Settings>({});
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/form-outreach/senders", {
        cache: "no-store",
      });
      const j = await res.json();
      setData(j?.settings ?? {});
    })();
  }, []);

  const onSave = async () => {
    await fetch("/api/form-outreach/senders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    alert("保存しました");
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-[22px] font-bold">送信元設定</h1>
      <div className="space-y-3 rounded-2xl border border-neutral-200 p-4">
        <Field label="送信元メールアドレス">
          <input
            value={data.from_email ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, from_email: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm"
            placeholder="noreply@example.com"
          />
        </Field>
        <Field label="ブランド名／署名の会社名">
          <input
            value={data.brand_name ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, brand_name: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm"
            placeholder="株式会社〇〇"
          />
        </Field>
        <Field label="Reply-To（任意）">
          <input
            value={data.reply_to ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, reply_to: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm"
            placeholder="support@example.com"
          />
        </Field>
        <div className="pt-2">
          <button
            onClick={onSave}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            保存
          </button>
        </div>
      </div>
    </main>
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
    <div>
      <label className="block text-sm text-neutral-700">{label}</label>
      {children}
    </div>
  );
}
