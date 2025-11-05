// web/src/app/job-boards/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";

type SiteKey = "mynavi" | "doda" | "type" | "womantype";

type PreviewRow = {
  site_key: SiteKey;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

type BatchResp = {
  ok: boolean;
  preview?: PreviewRow[]; // ここは undefined の可能性あり → UI 側で [] にする
  saved?: number;
  result_id?: string;
  note?: string;
  error?: string;
};

const SITES: { value: SiteKey; label: string }[] = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda（ダイレクトで候補者）" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];

// 簡易マスタ（UI側）
const AGE_BANDS = [
  "20歳以下",
  "25歳以下",
  "30歳以下",
  "35歳以下",
  "40歳以下",
  "45歳以下",
  "50歳以下",
  "55歳以下",
  "60歳以下",
  "65歳以下",
];

const EMP_TYPES = ["正社員", "契約社員", "派遣社員", "アルバイト", "業務委託"];

const SALARY_BAND = [
  "~300万",
  "300~400万",
  "400~500万",
  "500~600万",
  "600~800万",
  "800万~",
];

// 代表的な都道府県（UI）
const PREFS = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

export default function JobBoardsManualPage() {
  // 条件
  const [sites, setSites] = useState<SiteKey[]>(SITES.map((s) => s.value));
  const [large, setLarge] = useState<string[]>([]); // 職種(大)
  const [small, setSmall] = useState<string[]>([]); // 職種(小)
  const [ages, setAges] = useState<string[]>([]);
  const [emps, setEmps] = useState<string[]>([]);
  const [sals, setSals] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);

  const [want, setWant] = useState<number>(12);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");

  // プレビュー（取得順に積み上げ）
  const [added, setAdded] = useState<PreviewRow[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  // フロー可視化用ステップ
  type StepKey = "prepare" | "login" | "fetch" | "normalize" | "save" | "done";
  const [active, setActive] = useState<StepKey | null>(null);

  // アニメ用
  const tick = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      tick.current++;
    }, 400);
    return () => clearInterval(id);
  }, []);

  const toggle = <T extends string>(arr: T[], v: T, set: (x: T[]) => void) => {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const start = async () => {
    if (running) return;
    setRunning(true);
    setAdded([]);
    setSavedCount(0);
    setNote("");
    setActive("prepare");

    try {
      // 1) 準備
      await sleep(300);
      setActive("login");
      // 2) ログイン（必要サイトのみ）— サーバ側で実処理
      await sleep(300);

      setActive("fetch");

      // バッチ実行（APIは保存と同時にプレビュー返却）
      const res = await fetch("/api/job-boards/manual/run-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sites,
          large,
          small,
          age: ages,
          emp: emps,
          sal: sals,
          pref: prefs,
          want,
        }),
      });
      const j: BatchResp = await res
        .json()
        .catch(() => ({ ok: false, error: "invalid json" }));

      // プレビューを即反映（undefined対策）
      const preview = Array.isArray(j.preview) ? j.preview : [];
      if (preview.length) {
        setAdded((arr) => [...preview, ...arr]);
      }

      // 正規化完了 → 保存
      setActive("normalize");
      await sleep(200);
      setActive("save");
      setSavedCount((j.saved ?? 0) | 0);

      // 終了
      setActive("done");
      setNote(j.note || "");
    } catch (e: any) {
      setNote(String(e?.message || e));
      setActive("done");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">
            転職サイト 手動実行
          </h1>
          <Link
            href="/job-boards"
            className="rounded-lg border border-neutral-200 px-3 py-2 hover:bg-neutral-50"
          >
            トップへ
          </Link>
        </div>

        {/* 条件 */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* サイト */}
            <div>
              <div className="mb-1 text-xs text-neutral-600">対象サイト</div>
              <div className="flex flex-wrap gap-2">
                {SITES.map((s) => (
                  <label
                    key={s.value}
                    className={`text-xs inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${
                      sites.includes(s.value)
                        ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                        : "border-neutral-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={sites.includes(s.value)}
                      onChange={() => toggle(sites, s.value, setSites)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            {/* 職種（大） */}
            <div>
              <div className="mb-1 text-xs text-neutral-600">職種（大）</div>
              <input
                placeholder="カンマ区切り（例: ITエンジニア, 営業）"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={large.join(", ")}
                onChange={(e) =>
                  setLarge(
                    e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                  )
                }
              />
            </div>

            {/* 職種（小） */}
            <div>
              <div className="mb-1 text-xs text-neutral-600">職種（小）</div>
              <input
                placeholder="カンマ区切り（例: インフラ, 一般事務）"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={small.join(", ")}
                onChange={(e) =>
                  setSmall(
                    e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                  )
                }
              />
            </div>

            {/* 年齢層 */}
            <div>
              <div className="mb-1 text-xs text-neutral-600">年齢層</div>
              <div className="flex flex-wrap gap-2">
                {AGE_BANDS.map((a) => (
                  <label
                    key={a}
                    className={`text-xs inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${
                      ages.includes(a)
                        ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                        : "border-neutral-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={ages.includes(a)}
                      onChange={() => toggle(ages, a, setAges)}
                    />
                    {a}
                  </label>
                ))}
              </div>
            </div>

            {/* 雇用形態 */}
            <div>
              <div className="mb-1 text-xs text-neutral-600">雇用形態</div>
              <div className="flex flex-wrap gap-2">
                {EMP_TYPES.map((m) => (
                  <label
                    key={m}
                    className={`text-xs inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${
                      emps.includes(m)
                        ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                        : "border-neutral-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={emps.includes(m)}
                      onChange={() => toggle(emps, m, setEmps)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>

            {/* 年収帯 */}
            <div>
              <div className="mb-1 text-xs text-neutral-600">年収帯</div>
              <div className="flex flex-wrap gap-2">
                {SALARY_BAND.map((s) => (
                  <label
                    key={s}
                    className={`text-xs inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${
                      sals.includes(s)
                        ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                        : "border-neutral-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={sals.includes(s)}
                      onChange={() => toggle(sals, s, setSals)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            {/* 都道府県 */}
            <div className="md:col-span-3">
              <div className="mb-1 text-xs text-neutral-600">都道府県</div>
              <div className="flex flex-wrap gap-2">
                {PREFS.map((p) => (
                  <label
                    key={p}
                    className={`text-xs inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${
                      prefs.includes(p)
                        ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                        : "border-neutral-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={prefs.includes(p)}
                      onChange={() => toggle(prefs, p, setPrefs)}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>

            {/* 件数 */}
            <div>
              <div className="mb-1 text-xs text-neutral-600">
                取得件数（概数）
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                className="w-40 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={want}
                onChange={(e) =>
                  setWant(
                    Math.max(1, Math.min(500, Number(e.target.value) || 1))
                  )
                }
              />
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={start}
              disabled={running}
              className={`rounded-xl px-4 py-2 border ${
                running
                  ? "bg-neutral-100 text-neutral-400 border-neutral-200"
                  : "hover:bg-neutral-50 border-neutral-300"
              }`}
            >
              {running ? "実行中…" : "バッチ実行"}
            </button>
          </div>
        </section>

        {/* フロー可視化（アイコンはCSSアニメで点滅/回転） */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-4">
          <div className="text-sm text-neutral-600 mb-2">ワークフロー</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { k: "prepare", label: "準備" },
              { k: "login", label: "ログイン" },
              { k: "fetch", label: "取得" },
              { k: "normalize", label: "正規化" },
              { k: "save", label: "保存" },
              { k: "done", label: "完了" },
            ].map((s) => {
              const on = active === (s.k as StepKey);
              return (
                <div
                  key={s.k}
                  className={`rounded-xl border p-3 text-center ${
                    on ? "border-indigo-400 bg-indigo-50" : "border-neutral-200"
                  }`}
                >
                  <div className="mb-1">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        on ? "animate-pulse bg-indigo-500" : "bg-neutral-300"
                      }`}
                      aria-hidden
                    />
                  </div>
                  <div
                    className={`text-xs ${
                      on ? "text-indigo-700" : "text-neutral-600"
                    }`}
                  >
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
          {note && (
            <pre className="mt-3 text-xs text-neutral-500 whitespace-pre-wrap">
              {note}
            </pre>
          )}
        </section>

        {/* プレビュー（取得順に先頭追加） */}
        <section className="rounded-2xl border border-neutral-200 overflow-x-auto">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3 text-left">サイト</th>
                <th className="px-3 py-3 text-left">職種(大)</th>
                <th className="px-3 py-3 text-left">職種(小)</th>
                <th className="px-3 py-3 text-left">都道府県</th>
                <th className="px-3 py-3 text-right">求人数</th>
                <th className="px-3 py-3 text-right">求職者数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {added.map((r, i) => (
                <tr
                  key={`${i}-${r.site_key}-${r.internal_large ?? ""}-${
                    r.internal_small ?? ""
                  }-${r.prefecture ?? ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{r.site_key}</td>
                  <td className="px-3 py-2">{r.internal_large ?? "-"}</td>
                  <td className="px-3 py-2">{r.internal_small ?? "-"}</td>
                  <td className="px-3 py-2">{r.prefecture ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.jobs_count ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    {r.candidates_count ?? 0}
                  </td>
                </tr>
              ))}
              {added.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    まだありません
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-50">
                <td className="px-3 py-2" colSpan={4}>
                  保存済み
                </td>
                <td className="px-3 py-2 text-right" colSpan={2}>
                  {savedCount} 件
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      </main>
    </>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
