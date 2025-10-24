"use client";
import { useState } from "react";

export default function Client() {
  const [site, setSite] = useState("mynavi");
  const [msg, setMsg] = useState("");
  const run = async () => {
    const r = await fetch("/api/job-boards/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site }),
    });
    const j = await r.json();
    setMsg(j?.ok ? "キュー投入しました" : "失敗しました");
  };
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-[22px] font-bold">手動実行</h1>
      <div className="rounded-2xl border border-neutral-200 p-4">
        <label className="block text-sm text-neutral-700">サイト</label>
        <select
          value={site}
          onChange={(e) => setSite(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm"
        >
          <option value="mynavi">マイナビ</option>
          <option value="doda">Doda</option>
          <option value="type">type</option>
          <option value="wtype">女の転職type</option>
          <option value="rikunabi">リクナビNEXT</option>
          <option value="en">エン転職</option>
        </select>
        <div className="pt-3">
          <button
            onClick={run}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            今すぐ実行
          </button>
        </div>
        {msg && <div className="mt-2 text-sm text-neutral-600">{msg}</div>}
      </div>
    </main>
  );
}
