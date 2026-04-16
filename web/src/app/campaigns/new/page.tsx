"use client";
import React, { useEffect, useMemo, useRef, useState, DragEvent } from "react";
import { toastSuccess, toastError } from "@/components/AppToast";
import { PageHero, PageMain, SurfaceCard } from "@/components/PageChrome";

type Settings = { from_email?: string | null };

export default function CampaignNewPage() {
  const [mode, setMode] = useState<"plain" | "html">("plain");
  const [msg, setMsg] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
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

    let createdId: string | null = null;
    try {
      const j = await res.json();
      createdId = j?.id || j?.campaign?.id || j?.data?.id || null;
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

    if (createdId && files.length) {
      const ufd = new FormData();
      files.forEach((f) => ufd.append("files", f));
      const up = await fetch(
        `/api/attachments/upload?type=campaign&id=${createdId}`,
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
        setFiles([]);
      }
    }
  };

  const labelForBody = useMemo(
    () => (mode === "html" ? "本文（HTML）" : "本文（文章）"),
    [mode]
  );

  return (
    <PageMain className="max-w-5xl space-y-6">
      <PageHero
        eyebrow="Campaign Composer"
        title="新規キャンペーンを統一 UI で作成"
        description="メール一覧やメール配信トップと同じ情報構造で、件名・本文・添付・送信設定を整理しています。"
        accent="gold"
        actions={[
          { href: "/campaigns", label: "キャンペーン一覧", variant: "secondary" },
        ]}
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <SurfaceCard>
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
              基本情報
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              管理名、件名、差出人を先に固めます。
            </p>
          </div>
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
            <p className="mt-1 text-xs text-neutral-500">
              差し込み可: <code className="font-mono">{"{{NAME}}"}</code>,{" "}
              <code className="font-mono">
                {
                  "{{EMAIL}},{{COMPANY}},{{JOB}},{{GENDER}},{{AGE}},{{REGION}},{{PHONE}}"
                }
              </code>{" "}
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
              文章入力と HTML 入力を切り替えられます。
            </p>
          </div>
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

            <p className="mt-2 text-xs text-neutral-500">
              差し込み可: <code className="font-mono">{"{{NAME}}"}</code>,{" "}
              <code className="font-mono">
                {
                  "{{EMAIL}}, {{COMPANY}},{{JOB}},{{GENDER}},{{AGE}},{{REGION}},{{PHONE}}"
                }
              </code>
              <br />
              ※「文章」モードでも保存時にHTML化され、送信時に自動で個別化されます。
            </p>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
              添付ファイル
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              資料や補足データをまとめて添付できます。
            </p>
          </div>
          <div className="text-sm text-neutral-500">添付ファイル</div>
          <div
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
