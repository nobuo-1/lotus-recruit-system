"use client";
import { useState } from "react";

export default function Page() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/recipients/import", {
      method: "POST",
      body: fd,
    });
    const text = await res.text();
    setMsg(`${res.status}: ${text}`);
    setBusy(false);
  };

  return (
    <main className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-3">受信者インポート</h1>
      <form onSubmit={onUpload} className="space-y-3">
        <input
          name="file"
          type="file"
          accept=".csv"
          className="block"
          required
        />
        <button disabled={busy} className="rounded-lg border px-4 py-2">
          {busy ? "アップロード中…" : "アップロード"}
        </button>
      </form>
      <p className="mt-3 text-sm text-neutral-500">
        CSVヘッダー例: <code>email,name,region,job_type</code>
      </p>
      <pre className="mt-3 text-xs">{msg}</pre>
    </main>
  );
}
