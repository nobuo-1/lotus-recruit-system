"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastSuccess, toastError } from "@/components/AppToast";

export default function NewMailPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const res = await fetch("/api/mails", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, subject, body_text: body }),
    });
    const t = await res.text();
    setMsg(`${res.status}: ${t}`);
    setSubmitting(false);

    if (res.ok) {
      const j = JSON.parse(t);
      toastSuccess("保存しました");
      router.push(`/mails/${j.id}`);
    } else {
      toastError(`保存に失敗しました（${res.status}）`);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold text-neutral-900">
        新規メール
      </h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border p-4">
        <div>
          <label className="block text-sm text-neutral-600">管理名</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-600">件名</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-600">
            本文（プレーンテキスト）
          </label>
          <textarea
            className="mt-1 h-64 w-full rounded-xl border px-3 py-2"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end">
          <button
            disabled={submitting}
            className="rounded-xl border px-4 py-2 hover:bg-neutral-50"
          >
            {submitting ? "保存中…" : "保存"}
          </button>
        </div>
        <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
      </form>
    </main>
  );
}
