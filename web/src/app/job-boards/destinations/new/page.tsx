// web/src/app/job-boards/destinations/new/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useSearchParams } from "next/navigation";

type Row = {
  id?: string;
  name: string;
  type: "email" | "webhook" | "slack_webhook";
  value: string;
  enabled: boolean;
};

export default function NewDestination() {
  const sp = useSearchParams();
  const editId = sp.get("id");

  const [row, setRow] = useState<Row>({
    name: "",
    type: "email",
    value: "",
    enabled: true,
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!editId) return;
      const res = await fetch("/api/job-boards/destinations", {
        cache: "no-store",
      });
      const j = await res.json();
      if (res.ok) {
        const target = (j.rows || []).find((x: any) => x.id === editId);
        if (target) {
          setRow({
            id: target.id,
            name: target.name ?? "",
            type: (target.type as any) ?? "email",
            value: target.value ?? "",
            enabled: !!target.enabled,
          });
        }
      }
    };
    load();
  }, [editId]);

  const save = async () => {
    const r = await fetch("/api/job-boards/destinations", {
      method: row.id ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": "175b1a9d-3f85-482d-9323-68a44d214424",
      },
      body: JSON.stringify(row.id ? { id: row.id, ...row } : row),
    });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j?.error || "保存に失敗しました");
      return;
    }
    location.href = "/job-boards/destinations";
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-4">
          送り先{editId ? "を編集" : "を追加"}
        </h1>

        <section className="rounded-2xl border border-neutral-200 p-4 space-y-3">
          <Field label="名称">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={row.name}
              onChange={(e) => setRow({ ...row, name: e.target.value })}
            />
          </Field>
          <Field label="種別">
            <select
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={row.type}
              onChange={(e) => setRow({ ...row, type: e.target.value as any })}
            >
              <option value="email">メール</option>
              <option value="webhook">Webhook</option>
              <option value="slack_webhook">Slack Webhook</option>
            </select>
          </Field>
          <Field label="値（メールアドレス／URL）">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={row.value}
              onChange={(e) => setRow({ ...row, value: e.target.value })}
            />
          </Field>
          <Field label="有効">
            <label className="text-sm inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => setRow({ ...row, enabled: e.target.checked })}
              />
              有効にする
            </label>
          </Field>

          <div className="pt-2">
            <button
              onClick={save}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              {editId ? "更新する" : "作成する"}
            </button>
            {msg && <span className="ml-3 text-xs text-red-600">{msg}</span>}
          </div>
        </section>
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
