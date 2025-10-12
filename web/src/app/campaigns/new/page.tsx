"use client";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toastSuccess, toastError } from "@/components/AppToast";

type Settings = {
  from_email?: string | null;
};

export default function CampaignNewPage() {
  const [mode, setMode] = useState<"plain" | "html">("plain");
  const [msg, setMsg] = useState("");
  const [fromEmail, setFromEmail] = useState("");

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
    const fd = new FormData(e.currentTarget);
    const plain = (fd.get("body_plain") as string) ?? "";
    const htmlInput = (fd.get("body_html") as string) ?? "";

    const body_html =
      mode === "html"
        ? htmlInput
        : plain
            .split("\n")
            .map((l) => l.trim())
            .join("<br />");

    const payload = {
      name: fd.get("name"),
      subject: fd.get("subject"),
      from_email: fd.get("from_email"),
      body_html,
    };

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const t = await res.text();
    setMsg(`${res.status}: ${t}`);
    if (res.ok) {
      toastSuccess("保存しました");
    } else {
      toastError(`保存に失敗しました（${res.status}）`);
    }
  };

  const labelForBody = useMemo(
    () => (mode === "html" ? "本文（HTML）" : "本文（文章）"),
    [mode]
  );

  return (
    <main className="mx-auto max-w-3xl p-6">
      {/* ヘッダー：スマホ縦積み */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            キャンペーン作成
          </h1>
          <p className="text-sm text-neutral-500">配信用の内容を登録します</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/email"
            className="whitespace-nowrap rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            メール配信トップへ
          </Link>
          <Link
            href="/campaigns"
            className="whitespace-nowrap rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
          >
            キャンペーン一覧へ
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
              placeholder="キャンペーン名"
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
            {/* ▼ 差し込みヒント（TSエラーにならない書き方） */}
            <p className="mt-1 text-xs text-neutral-500">
              差し込み可: <code className="font-mono">{"{{NAME}}"}</code>,{" "}
              <code className="font-mono">{"{{EMAIL}}"}</code> （例:{" "}
              <code className="font-mono">{"{{NAME}}"}</code> 様）
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

        {/* 本文モード切替 */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-neutral-500">本文入力形式</span>
          <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-1 whitespace-nowrap">
            <input
              type="radio"
              name="bodymode"
              checked={mode === "plain"}
              onChange={() => setMode("plain")}
            />
            文章
          </label>
          <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-1 whitespace-nowrap">
            <input
              type="radio"
              name="bodymode"
              checked={mode === "html"}
              onChange={() => setMode("html")}
            />
            HTML
          </label>
        </div>

        <div>
          <div className="text-sm text-neutral-500">{labelForBody}</div>

          {mode === "plain" ? (
            <textarea
              name="body_plain"
              className="mt-1 w-full min-h-[220px] rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="そのまま文章を入力してください（改行は自動で&lt;br&gt;に変換されます）"
              required
            />
          ) : (
            <textarea
              name="body_html"
              className="mt-1 w-full min-h-[220px] font-mono rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="<p>Hello</p> のようなHTMLを記述してください"
              required
            />
          )}

          {/* ▼ 本文の差し込みヒント（TSエラーにならない書き方） */}
          <p className="mt-2 text-xs text-neutral-500">
            差し込み可: <code className="font-mono">{"{{NAME}}"}</code>,{" "}
            <code className="font-mono">{"{{EMAIL}}"}</code>
            （例: <code className="font-mono">{"{{NAME}}"}</code> 様）
            <br />
            ※「文章」モードでも保存時にHTML化され、送信時に自動で個別化されます。
          </p>
        </div>

        <div className="flex justify-end sm:justify-end">
          <button
            type="submit"
            className="w-full rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 sm:w-auto"
          >
            保存
          </button>
        </div>
      </form>

      <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
    </main>
  );
}
