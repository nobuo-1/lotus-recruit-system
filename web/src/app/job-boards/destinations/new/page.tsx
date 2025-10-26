// web/src/app/job-boards/destinations/new/page.tsx
"use client";
import React, { useState } from "react";
import AppHeader from "@/components/AppHeader";

export default function NewDestination() {
  const [name, setName] = useState("");
  const [type, setType] = useState<"email" | "webhook">("email");
  const [value, setValue] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [msg, setMsg] = useState("");

  const save = async () => {
    const r = await fetch("/api/job-boards/destinations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, value, enabled }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j?.error || "save failed");
    location.href = "/job-boards/destinations";
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold mb-3">送り先 追加</h1>
        <div className="rounded-2xl border border-neutral-200 p-4 space-y-3">
          <Field label="名称">
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="種別">
            <select
              className="rounded-lg border px-2 py-1 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as any)}
            >
              <option value="email">email</option>
              <option value="webhook">webhook</option>
            </select>
          </Field>
          <Field label="値（メール or URL）">
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <label className="text-sm inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            有効
          </label>
          <div>
            <button
              onClick={save}
              className="rounded-lg border px-3 py-2 hover:bg-neutral-50"
            >
              保存
            </button>
            {msg && <span className="ml-2 text-xs text-red-600">{msg}</span>}
          </div>
        </div>
      </main>
    </>
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
      <div className="mb-1 text-xs text-neutral-600">{label}</div>
      {children}
    </div>
  );
}
