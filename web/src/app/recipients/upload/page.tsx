"use client";
import React, { useRef, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { PageHero, PageMain, SurfaceCard } from "@/components/PageChrome";

export default function Page() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const syncSelectedFile = (file: File | null) => {
    setFileName(file?.name ?? "");
    if (file) setMsg("");
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    syncSelectedFile(e.target.files?.[0] ?? null);
  };

  const clearFile = () => {
    if (inputRef.current) inputRef.current.value = "";
    setFileName("");
    setMsg("");
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !inputRef.current) return;

    const dt = new DataTransfer();
    dt.items.add(file);
    inputRef.current.files = dt.files;
    syncSelectedFile(file);
  };

  const onUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputRef.current?.files?.length) {
      setMsg("ファイルを選択してください。");
      return;
    }

    setBusy(true);
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/recipients/import", {
      method: "POST",
      body: fd,
    });
    const text = await res.text();
    setMsg(`${res.status}: ${text}`);
    setBusy(false);
  };

  return (
    <PageMain className="max-w-5xl space-y-6">
      <PageHero
        eyebrow="Recipient Import"
        title="受信者リストを一括で取り込み"
        description="CSV / XLSX のドラッグ&ドロップに対応し、現在選択中のファイルと取り込み結果を同じ画面で確認できるようにしました。"
        accent="gold"
      />

      <form onSubmit={onUpload} className="space-y-4">
        <SurfaceCard className="space-y-4 p-6">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragging(false);
            }}
            onDrop={onDrop}
            className={`block cursor-pointer rounded-[28px] border-2 border-dashed p-10 transition ${
              dragging
                ? "border-neutral-950 bg-neutral-100"
                : "border-neutral-300 bg-[linear-gradient(180deg,#fafaf8_0%,#ffffff_100%)] hover:border-neutral-500 hover:bg-white"
            }`}
          >
            <input
              ref={inputRef}
              name="file"
              type="file"
              accept=".csv,.xlsx"
              className="sr-only"
              required
              onChange={onFileChange}
            />

            <div className="flex flex-col items-center text-center">
              <div className="mb-5 rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-neutral-200">
                <FileSpreadsheet className="h-9 w-9 text-neutral-700" />
              </div>
              <div className="text-xl font-semibold text-neutral-950">
                {fileName ? "ファイルを選択済みです" : "ファイルをここにドロップ"}
              </div>
              <div className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
                {fileName
                  ? "別のファイルを選ぶ場合は、再度クリックまたはドロップしてください。"
                  : "クリックして選択、または CSV / XLSX ファイルをドラッグしてください。"}
              </div>
              <div className="mt-5 inline-flex rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700">
                ファイルを選択
              </div>
            </div>
          </label>

          {fileName && (
            <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-neutral-100 p-2">
                  <FileSpreadsheet className="h-5 w-5 text-neutral-700" />
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">
                    {fileName}
                  </div>
                  <div className="text-xs text-neutral-500">
                    このファイルがインポート対象です
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={clearFile}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              >
                <X className="h-4 w-4" />
                選択解除
              </button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="text-sm font-medium text-neutral-900">対応形式</div>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                CSV / XLSX に対応。ヘッダーは{" "}
                <code>email,name,company_name,region,job_type</code> または{" "}
                <code>メールアドレス,担当者名,企業名,都道府県,職種</code> を使えます。
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-[#faf7ef] p-4">
              <div className="text-sm font-medium text-neutral-900">運用メモ</div>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                取り込み後は受信者一覧で配信停止、重複、地域情報を確認してください。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={busy || !fileName}
              className="inline-flex items-center gap-2 rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              <Upload className="h-4 w-4" />
              {busy ? "アップロード中…" : "実行する"}
            </button>
            {!fileName && (
              <span className="text-sm text-neutral-500">
                先にファイルを選択してください
              </span>
            )}
          </div>
        </SurfaceCard>
      </form>

      {msg && (
        <SurfaceCard className="bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)]">
          <div className="mb-2 text-sm font-medium text-neutral-900">
            取込結果
          </div>
          <pre className="whitespace-pre-wrap break-all text-xs text-neutral-700">
            {msg}
          </pre>
        </SurfaceCard>
      )}
    </PageMain>
  );
}
