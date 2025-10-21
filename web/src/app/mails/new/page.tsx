// web/src/app/mails/new/page.tsx
"use client";
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { toastSuccess, toastError } from "@/components/AppToast";
import { supabase } from "@/lib/supabaseClient";

type Settings = {
  from_email?: string | null;
};

export default function MailNewPage() {
  const [msg, setMsg] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/settings", { cache: "no-store" });
        if (res.ok) {
          const j: Settings = await res.json();
          setFromEmail(String(j?.from_email ?? ""));
        }
      } catch {
        /* no-op */
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setMsg("保存中…");
    try {
      const fd = new FormData(e.currentTarget);

      const body_text = (fd.get("body_text") as string) ?? "";
      const body_html = body_text
        .split("\n")
        .map((l) => l.trim())
        .join("<br />");

      const payload = {
        name: fd.get("name"),
        subject: fd.get("subject"),
        from_email: fd.get("from_email"),
        body_text,
        body_html,
      };

      const res = await fetch("/api/mails", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      let createdId: string | null = null;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json();
        createdId = j?.id ?? null;
        setMsg(`${res.status}: ${JSON.stringify(j)}`);
      } else {
        const t = await res.text();
        setMsg(`${res.status}: ${t}`);
      }

      if (!res.ok) {
        toastError(`保存に失敗しました（${res.status}）`);
        setBusy(false);
        return;
      }

      // 添付アップロード & メタ登録
      const files = fileRef.current?.files;
      if (createdId && files && files.length) {
        for (const file of Array.from(files)) {
          const path = `mail/${createdId}/${Date.now()}_${file.name}`;
          const up = await supabase.storage
            .from("email_attachments")
            .upload(path, file, { upsert: false });
          if (up.error) throw up.error;

          // 型エラー回避のため any 配列で insert
          await supabase.from("mail_attachments").insert([
            {
              mail_id: createdId,
              file_path: path,
              file_name: file.name,
              mime_type: file.type,
              size_bytes: file.size,
            },
          ] as any);
        }
      }

      toastSuccess("保存しました");
      if (files && files.length && !createdId) {
        toastError("添付は保存できませんでした（作成IDが取得できません）");
      }
    } catch (e: any) {
      toastError(e?.message || "保存でエラー");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      {/* ヘッダー：スマホ縦積み */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            メール作成
          </h1>
          <p className="text-sm text-neutral-500">
            プレーンテキストのメールを作成します
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/email"
            className="whitespace-nowrap rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            メール配信トップへ
          </Link>
          <Link
            href="/mails"
            className="whitespace-nowrap rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            メール一覧へ
          </Link>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-neutral-200 p-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm text-neutral-500">内部名</div>
            <input
              name="name"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="メール名"
              required
            />
          </div>

          <div>
            <div className="text-sm text-neutral-500">件名</div>
            <input
              name="subject"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="メール件名（例: {{NAME}} 様へのご案内）"
              required
            />
            <p className="mt-1 text-xs text-neutral-500">
              差し込み可: <code className="font-mono">{"{{NAME}}"}</code>,{" "}
              <code className="font-mono">{"{{EMAIL}}"}</code>
            </p>
          </div>

          <div className="md:col-span-2">
            <div className="text-sm text-neutral-500">差出人メール</div>
            <input
              name="from_email"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="noreply@example.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <div className="text-sm text-neutral-500">本文（文章）</div>
          <textarea
            name="body_text"
            className="mt-1 w-full min-h-[240px] rounded-lg border border-neutral-300 px-3 py-2"
            placeholder="そのまま文章を入力してください（差し込み可: {{NAME}}, {{EMAIL}}）"
            required
          />
          <p className="mt-2 text-xs text-neutral-500">
            差し込み可: <code className="font-mono">{"{{NAME}}"}</code>,{" "}
            <code className="font-mono">{"{{EMAIL}}"}</code>
          </p>
        </div>

        {/* 添付UI（PDF/画像） */}
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-sm font-medium text-neutral-700">
            添付ファイル（PDF/画像）
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="mt-2"
          />
          <p className="mt-1 text-xs text-neutral-500">
            保存後、自動でアップロード＆紐付けします。
          </p>
        </div>

        <div className="flex justify-end sm:justify-end">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 sm:w-auto"
          >
            {busy ? "処理中…" : "保存"}
          </button>
        </div>
      </form>

      <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
    </main>
  );
}
