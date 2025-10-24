"use client";
import { useEffect, useState } from "react";

type R = { id: string; email: string; created_at: string };

export default function Client() {
  const [list, setList] = useState<R[]>([]);
  const [email, setEmail] = useState("");
  const load = async () => {
    const r = await fetch("/api/job-boards/recipients", { cache: "no-store" });
    const j = await r.json();
    setList(j?.items ?? []);
  };
  useEffect(() => {
    load();
  }, []);
  const add = async () => {
    if (!email) return;
    await fetch("/api/job-boards/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setEmail("");
    await load();
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-[22px] font-bold">収集データの送り先</h1>
      <div className="mb-3 rounded-2xl border border-neutral-200 p-4">
        <label className="block text-sm text-neutral-700">
          メールアドレスを追加
        </label>
        <div className="mt-1 flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 p-2 text-sm"
            placeholder="foo@example.com"
          />
          <button
            onClick={add}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            追加
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left">メールアドレス</th>
              <th className="px-3 py-2 text-left">追加日</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.email}</td>
                <td className="px-3 py-2">
                  {new Date(r.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
