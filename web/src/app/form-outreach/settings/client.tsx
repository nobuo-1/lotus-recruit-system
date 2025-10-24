// web/src/app/form-outreach/settings/client.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Settings = {
  from_email?: string;
  brand_name?: string;
  reply_to?: string;
};

export default function Client() {
  const [data, setData] = useState<Settings>({});

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/form-outreach/settings", {
        cache: "no-store",
      });
      const j = await res.json();
      setData(j?.settings ?? {});
    })();
  }, []);

  const onSave = async () => {
    await fetch("/api/form-outreach/settings", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    });
    alert("保存しました");
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-bold">フォーム営業の送信設定</h1>
        <Link
          href="/form-outreach"
          className="text-sm text-indigo-700 underline-offset-2 hover:underline"
        >
          戻る
        </Link>
      </div>

      <div className="space-y-3 rounded-2xl border border-neutral-200 p-4">
        <div>
          <label className="block text-sm text-neutral-700">
            送信元メールアドレス
          </label>
          <input
            value={data.from_email ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, from_email: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm"
            placeholder="noreply@example.com"
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-700">
            ブランド名／署名の会社名
          </label>
          <input
            value={data.brand_name ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, brand_name: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm"
            placeholder="株式会社〇〇"
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-700">
            Reply-To（任意）
          </label>
          <input
            value={data.reply_to ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, reply_to: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm"
            placeholder="support@example.com"
          />
        </div>
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
