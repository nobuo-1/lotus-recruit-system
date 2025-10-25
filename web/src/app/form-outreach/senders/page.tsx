// web/src/app/form-outreach/senders/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

export default function SendersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    from_name: "",
    from_email: "",
    reply_to: "",
    signature: "",
    is_default: false,
  });

  const load = async () => {
    const j = await fetch("/api/form-outreach/senders", {
      cache: "no-store",
    }).then((r) => r.json());
    setRows(j?.rows ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    await fetch("/api/form-outreach/senders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({
      from_name: "",
      from_email: "",
      reply_to: "",
      signature: "",
      is_default: false,
    });
    await load();
  };
  const setDefault = async (id: string) => {
    // 先に全解除→対象のみON
    await Promise.all(
      rows.map((r) =>
        fetch("/api/form-outreach/senders", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: r.id, is_default: false }),
        })
      )
    );
    await fetch("/api/form-outreach/senders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_default: true }),
    });
    await load();
  };
  const remove = async (id: string) => {
    await fetch(`/api/form-outreach/senders?id=${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-4">
          送信元設定
        </h1>

        <section className="rounded-2xl border border-neutral-200 p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              placeholder="From 名"
              value={form.from_name}
              onChange={(e) => setForm({ ...form, from_name: e.target.value })}
            />
            <input
              className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              placeholder="From メール"
              value={form.from_email}
              onChange={(e) => setForm({ ...form, from_email: e.target.value })}
            />
            <input
              className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              placeholder="Reply-To（任意）"
              value={form.reply_to}
              onChange={(e) => setForm({ ...form, reply_to: e.target.value })}
            />
            <input
              className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              placeholder="署名（任意）"
              value={form.signature}
              onChange={(e) => setForm({ ...form, signature: e.target.value })}
            />
          </div>
          <div className="mt-2">
            <label className="text-sm">
              <input
                type="checkbox"
                className="mr-2"
                checked={form.is_default}
                onChange={(e) =>
                  setForm({ ...form, is_default: e.target.checked })
                }
              />{" "}
              デフォルトにする
            </label>
          </div>
          <div className="mt-2">
            <button
              onClick={add}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
            >
              追加
            </button>
          </div>
        </section>

        <section className="mt-6 overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">From 名</th>
                <th className="px-3 py-3 text-left">From メール</th>
                <th className="px-3 py-3 text-left">Reply-To</th>
                <th className="px-3 py-3 text-left">署名</th>
                <th className="px-3 py-3 text-left">既定</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{r.from_name || "-"}</td>
                  <td className="px-3 py-2">{r.from_email || "-"}</td>
                  <td className="px-3 py-2">{r.reply_to || "-"}</td>
                  <td className="px-3 py-2">{r.signature || "-"}</td>
                  <td className="px-3 py-2">{r.is_default ? "✅" : ""}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {!r.is_default && (
                        <button
                          onClick={() => setDefault(r.id)}
                          className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                        >
                          既定にする
                        </button>
                      )}
                      <button
                        onClick={() => remove(r.id)}
                        className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-neutral-400"
                  >
                    送信元がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
