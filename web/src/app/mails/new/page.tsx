// web/src/app/mails/new/page.tsx
"use client";
import React, { useEffect, useState, useRef, DragEvent } from "react";
import { toastSuccess, toastError } from "@/components/AppToast";
import { PageHero, PageMain, SurfaceCard } from "@/components/PageChrome";

type Settings = { from_email?: string | null };

export default function MailNewPage() {
  const [msg, setMsg] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [isOver, setIsOver] = useState(false);

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

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list || []);
    if (!arr.length) return;
    // 同名・同サイズの重複を除外
    const key = (f: File) => `${f.name}::${f.size}`;
    const existed = new Set(files.map(key));
    const next = [...files];
    for (const f of arr) if (!existed.has(key(f))) next.push(f);
    setFiles(next);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files) addFiles(e.currentTarget.files);
    // 同じファイルを再選択できるようにリセット
    e.currentTarget.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };
  const onDragLeave = () => setIsOver(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
    try {
      const j = await res.json();
      createdId = j?.id || j?.mail?.id || j?.data?.id || null;
      setMsg(`${res.status}: ${JSON.stringify(j)}`);
    } catch {
      const t = await res.text();
      setMsg(`${res.status}: ${t}`);
    }

    if (!res.ok) {
      toastError(`保存に失敗しました（${res.status}）`);
      return;
    }
    toastSuccess("保存しました");

    // 添付があればアップロード
    if (createdId && files.length) {
      const ufd = new FormData();
      files.forEach((f) => ufd.append("files", f));
      const up = await fetch(
        `/api/attachments/upload?type=mail&id=${createdId}`,
        {
          method: "POST",
          body: ufd,
        }
      );
      if (!up.ok) {
        const t = await up.text();
        toastError(`添付アップロード失敗: ${up.status} ${t}`);
      } else {
        toastSuccess("添付をアップロードしました");
        setFiles([]); // 成功時は選択をクリア
      }
    }
  };

  return (
    <PageMain className="max-w-5xl space-y-6">
      <PageHero
        eyebrow="Mail Composer"
        title="新規メールを配信基準の UI で作成"
        description="内部名、件名、差出人、本文、添付を分かりやすく分け、メール配信トップや一覧と同じトーンで揃えています。"
        accent="blue"
        actions={[
          { href: "/mails", label: "メール一覧", variant: "secondary" },
        ]}
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <SurfaceCard>
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
              基本情報
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              配信対象に見せない管理用情報と送信設定です。
            </p>
          </div>
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
              <code className="font-mono">
                {
                  "{{EMAIL}},{{COMPANY}},{{JOB}},{{GENDER}},{{AGE}},{{REGION}},{{PHONE}}"
                }
              </code>
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
        </SurfaceCard>

        <SurfaceCard>
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
              本文
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              差し込み変数を使って個別化できます。
            </p>
          </div>
          <div className="text-sm text-neutral-500">本文（文章）</div>
          <textarea
            name="body_text"
            className="mt-1 w-full min-h-[240px] rounded-lg border border-neutral-300 px-3 py-2"
            placeholder="そのまま文章を入力してください（差し込み例: {{NAME}}, {{EMAIL}}, {{COMPANY}}）"
            required
          />
          <p className="mt-2 text-xs text-neutral-500">
            差し込み可: <code className="font-mono">{"{{NAME}}"}</code>,{" "}
            <code className="font-mono">
              {
                "{{EMAIL}},{{COMPANY}},{{JOB}},{{GENDER}},{{AGE}},{{REGION}},{{PHONE}}"
              }
            </code>
            （例: <code className="font-mono">{"{{NAME}}"}</code> 様）
          </p>
        </SurfaceCard>

        <SurfaceCard>
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
              添付ファイル
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              クリックまたはドラッグ&ドロップで追加できます。
            </p>
          </div>
          <div className="text-sm text-neutral-500">添付ファイル</div>
          <div
            ref={dropRef}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`mt-1 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center ${
              isOver ? "border-blue-400 bg-blue-50" : "border-neutral-300"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onInputChange}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
            >
              ここをクリックしてファイルを選択
            </button>
            <div className="mt-2 text-xs text-neutral-500">
              またはドラッグ＆ドロップ
            </div>
          </div>

          {/* 選択中一覧 */}
          <div className="mt-3 rounded-lg border border-neutral-200 p-3">
            <div className="mb-1 text-sm text-neutral-600">選択中</div>
            {files.length ? (
              <ul className="list-disc pl-5 text-sm">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}-${i}`}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      解除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-neutral-400">選択されていません</div>
            )}
          </div>
        </SurfaceCard>

        <div className="flex justify-end">
          <button
            type="submit"
            className="w-full rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-800 sm:w-auto"
          >
            保存
          </button>
        </div>
      </form>

      <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
    </PageMain>
  );
}
