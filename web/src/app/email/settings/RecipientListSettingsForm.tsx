// web/src/app/email/settings/RecipientListSettingsForm.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import {
  useRecipientListSettings,
  RecipientColumnKey,
} from "@/lib/hooks/useRecipientListSettings";

const OPTIONS: { key: RecipientColumnKey; label: string }[] = [
  { key: "name", label: "名前" },
  { key: "company_name", label: "会社名" },
  { key: "job_categories", label: "職種（複数）" },
  { key: "gender", label: "性別" },
  { key: "age", label: "年齢" },
  { key: "created_at", label: "作成日" },
  { key: "email", label: "メール" },
  { key: "region", label: "地域" },
  { key: "phone", label: "電話" },
];

export default function RecipientListSettingsForm() {
  const { cols, loading, save } = useRecipientListSettings();
  const [selected, setSelected] = useState<RecipientColumnKey[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelected(cols);
  }, [cols]);

  if (loading) return <div>読み込み中…</div>;

  const toggle = (k: RecipientColumnKey) => {
    setSelected((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  };

  const onSave = () => {
    startTransition(async () => {
      const { error } = await save(selected);
      if (error) alert("保存に失敗しました: " + error.message);
      else alert("保存しました");
    });
  };

  return (
    <div className="space-y-4">
      {/* ← ここがコメントになっていたので描画されていませんでした */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map((o) => (
          <label key={o.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(o.key)}
              onChange={() => toggle(o.key)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>

      <p className="text-sm text-neutral-500">
        ※ 「アクティブ切替」「操作（編集/消去）」は常に表示されます。
      </p>

      <div className="flex justify-end">
        <button
          onClick={onSave}
          disabled={isPending}
          className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
        >
          {isPending ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
