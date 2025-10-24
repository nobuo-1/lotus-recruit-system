// web/src/app/form-outreach/templates/client.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Template = {
  id: string;
  name: string;
  step: number; // 1=一送信目, 2=二送信目 ...
  subject?: string | null;
  body: string;
  is_active: boolean;
  updated_at: string;
};

export default function Client() {
  const [items, setItems] = useState<Template[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/form-outreach/templates", {
        cache: "no-store",
      });
      const j = await res.json();
      setItems(j?.items ?? []);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-bold">メッセージテンプレート</h1>
        <Link
          href="/form-outreach"
          className="text-sm text-indigo-700 underline-offset-2 hover:underline"
        >
          戻る
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left">名称</th>
              <th className="px-3 py-2 text-left">送信ステップ</th>
              <th className="px-3 py-2 text-left">件名</th>
              <th className="px-3 py-2 text-left">最終更新</th>
              <th className="px-3 py-2 text-left">状態</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2">{t.step} 回目</td>
                <td className="px-3 py-2">{t.subject ?? "（なし）"}</td>
                <td className="px-3 py-2">
                  {new Date(t.updated_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">{t.is_active ? "有効" : "無効"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
