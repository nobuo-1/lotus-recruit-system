"use client";
import React from "react";
import { useEffect, useState } from "react";

export default function CompanySettingsPage() {
  const [form, setForm] = useState({
    company_name: "",
    company_address: "",
    support_email: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/settings/company");
        if (!r.ok) throw new Error(await r.text());
        const j = await r.json();
        setForm({
          company_name: j.company_name ?? "",
          company_address: j.company_address ?? "",
          support_email: j.support_email ?? "",
        });
      } catch (e: any) {
        setMsg(`読み込み失敗: ${e.message ?? e}`);
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/settings/company", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(t);
      setMsg("保存しました");
    } catch (e: any) {
      setMsg(`保存失敗: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">会社情報</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">会社名 *</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.company_name}
            onChange={(e) =>
              setForm((s) => ({ ...s, company_name: e.target.value }))
            }
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">住所</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.company_address}
            onChange={(e) =>
              setForm((s) => ({ ...s, company_address: e.target.value }))
            }
            placeholder="任意"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            サポートメール
          </label>
          <input
            className="w-full border rounded px-3 py-2"
            type="email"
            value={form.support_email}
            onChange={(e) =>
              setForm((s) => ({ ...s, support_email: e.target.value }))
            }
            placeholder="support@example.com"
          />
        </div>
        <button disabled={busy} className="rounded-lg border px-4 py-2">
          {busy ? "保存中…" : "保存"}
        </button>
      </form>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </main>
  );
}
