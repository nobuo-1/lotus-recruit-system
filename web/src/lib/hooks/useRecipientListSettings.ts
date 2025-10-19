// web/src/lib/hooks/useRecipientListSettings.ts
"use client";
import { useEffect, useState } from "react";

export type RecipientColumnKey =
  | "name"
  | "company_name"
  | "job_categories"
  | "gender"
  | "age"
  | "created_at"
  | "email"
  | "region"
  | "phone";

const DEFAULT_COLS: RecipientColumnKey[] = [
  "name",
  "email",
  "region",
  "created_at",
];

export function useRecipientListSettings() {
  const [cols, setCols] = useState<RecipientColumnKey[]>(DEFAULT_COLS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/recipient-list-settings", {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        const arr = (j?.visible_columns ??
          DEFAULT_COLS) as RecipientColumnKey[];
        setCols(arr as RecipientColumnKey[]);
      } catch {
        setCols(DEFAULT_COLS);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (next: RecipientColumnKey[]) => {
    const res = await fetch("/api/email/recipient-list-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible_columns: next }),
    });
    if (res.ok) setCols(next);
    return { error: res.ok ? null : new Error(await res.text()) };
  };

  return { cols, loading, save };
}
