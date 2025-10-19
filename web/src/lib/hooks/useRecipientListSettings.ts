// web/src/lib/hooks/useRecipientListSettings.ts
"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

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

// ← as const はやめて“可変配列”で持つ
const FALLBACK: RecipientColumnKey[] = [
  "name",
  "company_name",
  "job_categories",
  "email",
  "region",
  "created_at",
];

export function useRecipientListSettings() {
  const [cols, setCols] = useState<RecipientColumnKey[]>([...FALLBACK]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabaseBrowser.rpc(
        "app_get_recipient_list_settings"
      );
      if (!error && Array.isArray(data) && data.length) {
        setCols(data as RecipientColumnKey[]);
      } else {
        setCols([...FALLBACK]);
      }
      setLoading(false);
    })();
  }, []);

  const save = async (next: RecipientColumnKey[]) => {
    return supabaseBrowser.rpc("app_set_recipient_list_settings", {
      cols: next,
    });
  };

  return { cols, loading, save };
}
