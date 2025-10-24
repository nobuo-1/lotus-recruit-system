"use client";
import { useEffect, useState } from "react";

type Template = {
  id: string;
  name: string;
  step: number;
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
      <h1 className="mb-4 text-[22px] font-bold">メッセージ / シーケンス</h1>
      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left">名称</th>
              <th className="px-3 py-2">送信ステップ</th>
              <th className="px-3 py-2">件名</th>
              <th className="px-3 py-2">状態</th>
              <th className="px-3 py-2">更新</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2 text-center">{t.step}回目</td>
                <td className="px-3 py-2">{t.subject ?? "（なし）"}</td>
                <td className="px-3 py-2">{t.is_active ? "有効" : "無効"}</td>
                <td className="px-3 py-2">
                  {new Date(t.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
