// web/src/app/settings/org/page.tsx
"use client";
import React from "react";
import { useEffect, useState } from "react";

type Brand = {
  company_name?: string;
  company_address?: string;
  support_email?: string;
  from_email?: string;
};

export default function OrgSettingsPage() {
  const [form, setForm] = useState<Brand>({});
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings/brand");
      const j = await res.json();
      if (j?.brand) setForm(j.brand);
    })();
  }, []);

  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/settings/brand", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const t = await res.text();
    setMsg(`${res.status}: ${t}`);
    setBusy(false);
  };

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">組織設定（ブランド）</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">会社名</label>
          <input
            name="company_name"
            value={form.company_name ?? ""}
            onChange={onChange}
            className="w-full border rounded p-2"
            placeholder="例: 株式会社〇〇"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">住所</label>
          <textarea
            name="company_address"
            value={form.company_address ?? ""}
            onChange={onChange}
            className="w-full border rounded p-2"
            rows={3}
            placeholder="例: 東京都〇〇区…"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">サポートメール</label>
            <input
              name="support_email"
              value={form.support_email ?? ""}
              onChange={onChange}
              className="w-full border rounded p-2"
              placeholder="support@example.com"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">差出人メール（From）</label>
            <input
              name="from_email"
              value={form.from_email ?? ""}
              onChange={onChange}
              className="w-full border rounded p-2"
              placeholder="no-reply@example.com"
            />
          </div>
        </div>

        <button
          disabled={busy}
          className="rounded-lg border px-4 py-2 hover:bg-neutral-50"
        >
          {busy ? "保存中…" : "保存"}
        </button>
      </form>

      <pre className="mt-4 text-xs text-neutral-500">{msg}</pre>
    </main>
  );
}
