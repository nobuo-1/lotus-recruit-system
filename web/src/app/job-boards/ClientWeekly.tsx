"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type Site = "mynavi" | "doda" | "type" | "wtype" | "rikunabi" | "en";
const LABEL: Record<Site, string> = {
  mynavi: "マイナビ",
  doda: "Doda",
  type: "type",
  wtype: "女の転職type",
  rikunabi: "リクナビNEXT",
  en: "エン転職",
};
type Period = "8w" | "26w" | "52w";

type Series = {
  week: string;
  postings: number;
  seekers: number;
  category_label?: string | null;
  location?: string | null;
  salary_band?: string | null;
  employment?: string | null;
  age_band?: string | null;
};
type Resp = { ok: boolean; site: Site; filters: any; series: Series[] };

export default function ClientWeekly() {
  const [site, setSite] = useState<Site>("mynavi");
  const [period, setPeriod] = useState<Period>("26w");
  const [data, setData] = useState<Resp | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams({ period, site });
        const r = await fetch(`/api/job-boards/metrics-weekly?${qs}`, {
          cache: "no-store",
        });
        const j = await r.json();
        setData(j);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, [site, period]);

  const totals = useMemo(() => {
    const p = (data?.series ?? []).reduce((s, r) => s + (r.postings || 0), 0);
    const s = (data?.series ?? []).reduce((s, r) => s + (r.seekers || 0), 0);
    return { p, s };
  }, [data]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-2">
        <h1 className="text-[26px] font-extrabold tracking-tight text-indigo-900">
          転職サイトリサーチ
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          サイト毎の週次推移（合計は表示しません）
        </p>
      </div>

      {/* アクション導線 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/job-boards/manual"
          className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
        >
          手動実行
        </Link>
        <Link
          href="/job-boards/runs"
          className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
        >
          実行状況の詳細
        </Link>
        <Link
          href="/job-boards/recipients"
          className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
        >
          収集データ送り先
        </Link>
      </div>

      {/* フィルタ */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1">
          {(
            ["mynavi", "doda", "type", "wtype", "rikunabi", "en"] as Site[]
          ).map((s) => (
            <button
              key={s}
              onClick={() => setSite(s)}
              className={`rounded-lg px-2 py-1 text-xs ${
                site === s
                  ? "border border-indigo-400 text-indigo-700"
                  : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {LABEL[s]}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1">
          {(["8w", "26w", "52w"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-2 py-1 text-xs ${
                period === p
                  ? "border border-neutral-400 text-neutral-800"
                  : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              {p === "8w" ? "2ヶ月" : "26w" ? "半年" : "1年"}
            </button>
          ))}
        </div>
      </div>

      {/* グラフ（サイト単位） */}
      <section className="mb-4 rounded-2xl border border-neutral-200 p-4">
        <div className="mb-2 text-sm text-neutral-700">
          {LABEL[site]} 週次推移：
          <span className="font-semibold">
            求人数 {totals.p.toLocaleString()} / 求職者{" "}
            {totals.s.toLocaleString()}
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.series ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="postings"
                name="求人数"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="seekers"
                name="求職者数"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 表（同一データ） */}
      <section className="overflow-hidden rounded-2xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left">週</th>
              <th className="px-3 py-2 text-right">求人数</th>
              <th className="px-3 py-2 text-right">求職者数</th>
              <th className="px-3 py-2 text-left">職種（サイト区分）</th>
              <th className="px-3 py-2 text-left">勤務地</th>
              <th className="px-3 py-2 text-left">年収帯</th>
              <th className="px-3 py-2 text-left">雇用形態</th>
              <th className="px-3 py-2 text-left">年齢帯</th>
            </tr>
          </thead>
          <tbody>
            {(data?.series ?? []).map((r) => (
              <tr key={r.week} className="border-t">
                <td className="px-3 py-2">{r.week}</td>
                <td className="px-3 py-2 text-right">
                  {r.postings.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.seekers.toLocaleString()}
                </td>
                <td className="px-3 py-2">{r.category_label ?? "—"}</td>
                <td className="px-3 py-2">{r.location ?? "—"}</td>
                <td className="px-3 py-2">{r.salary_band ?? "—"}</td>
                <td className="px-3 py-2">{r.employment ?? "—"}</td>
                <td className="px-3 py-2">{r.age_band ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {msg && (
        <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-500">
          {msg}
        </pre>
      )}
    </main>
  );
}
