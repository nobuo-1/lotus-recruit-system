// web/src/app/job-boards/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";

// 職種モーダル（修正版）
const JobCategoryModal = dynamic(
  () => import("@/components/job-boards/JobCategoryModal"),
  { ssr: false }
);

/** =========================
 * 都道府県モーダル（共通）
 * ========================= */
const PREF_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "北海道・東北",
    items: [
      "北海道",
      "青森県",
      "岩手県",
      "宮城県",
      "秋田県",
      "山形県",
      "福島県",
    ],
  },
  {
    label: "関東",
    items: [
      "茨城県",
      "栃木県",
      "群馬県",
      "埼玉県",
      "千葉県",
      "東京都",
      "神奈川県",
    ],
  },
  {
    label: "中部",
    items: [
      "新潟県",
      "富山県",
      "石川県",
      "福井県",
      "山梨県",
      "長野県",
      "岐阜県",
      "静岡県",
      "愛知県",
    ],
  },
  {
    label: "近畿",
    items: [
      "三重県",
      "滋賀県",
      "京都府",
      "大阪府",
      "兵庫県",
      "奈良県",
      "和歌山県",
    ],
  },
  { label: "中国", items: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"] },
  { label: "四国", items: ["徳島県", "香川県", "愛媛県", "高知県"] },
  {
    label: "九州・沖縄",
    items: [
      "福岡県",
      "佐賀県",
      "長崎県",
      "熊本県",
      "大分県",
      "宮崎県",
      "鹿児島県",
      "沖縄県",
    ],
  },
];

function PrefectureModal({
  selected,
  onCloseAction,
  onApplyAction,
}: {
  selected: string[];
  onCloseAction: () => void;
  onApplyAction: (pref: string[]) => void;
}) {
  const [pref, setPref] = useState<string[]>(selected ?? []);
  const [query, setQuery] = useState("");
  useEffect(() => setPref(selected ?? []), [selected]);
  const all = useMemo(() => PREF_GROUPS.flatMap((g) => g.items), []);
  const nationalAll = pref.length === all.length;

  const filteredGroups = useMemo(() => {
    const q = query.trim();
    if (!q) return PREF_GROUPS;
    return PREF_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((x) => x.includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const toggleNational = (checked: boolean) => setPref(checked ? [...all] : []);
  const regionAllChecked = (items: string[]) =>
    items.every((x) => pref.includes(x)) && items.length > 0;
  const toggleRegionAll = (items: string[], checked: boolean) => {
    if (checked) setPref(Array.from(new Set([...pref, ...items])));
    else setPref(pref.filter((x) => !items.includes(x)));
  };
  const toggleOne = (name: string, checked: boolean) => {
    setPref((p) =>
      checked ? Array.from(new Set([...p, name])) : p.filter((x) => x !== name)
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[980px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="font-semibold">都道府県選択</div>
          <button
            onClick={onCloseAction}
            className="rounded-lg px-2 py-1 border border-neutral-300 hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm inline-flex items-center">
              <input
                type="checkbox"
                className="mr-2"
                checked={nationalAll}
                onChange={(e) => toggleNational(e.target.checked)}
              />
              全国 すべて選択
            </label>
            <input
              className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="検索（例: 大阪、東）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="max-h-[520px] overflow-auto space-y-3">
            {filteredGroups.map((g) => {
              const regionAll = regionAllChecked(g.items);
              return (
                <div
                  key={g.label}
                  className="rounded-xl border border-neutral-200 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-neutral-700">
                      {g.label}
                    </div>
                    <label className="text-xs inline-flex items-center">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={regionAll}
                        onChange={(e) =>
                          toggleRegionAll(g.items, e.target.checked)
                        }
                      />
                      この地方をすべて選択/解除
                    </label>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2 text-sm">
                    {g.items.map((name) => {
                      const checked = pref.includes(name);
                      return (
                        <label
                          key={name}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                            checked
                              ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                              : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleOne(name, e.target.checked)}
                          />
                          {name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {filteredGroups.length === 0 && (
              <div className="text-xs text-neutral-400">
                該当する都道府県がありません
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200">
          <button
            onClick={() => setPref([])}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            クリア
          </button>
          <button
            onClick={() => onApplyAction(pref)}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            適用して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

/** =========================
 * 手動実行ページ
 * ========================= */

const SITE_OPTIONS: { value: string; label: string }[] = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];

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

type ManualFetchRow = {
  site_key: string;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

/** ===== UUID / Tenant ユーティリティ ===== */
function isValidUuid(v: string | null | undefined): v is string {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}
function getTenantIdFromCookie(): string | null {
  try {
    const m = document.cookie.match(
      /(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i
    );
    return m ? decodeURIComponent(m[2]) : null;
  } catch {
    return null;
  }
}
function setTenantCookies(id: string) {
  try {
    const secure =
      typeof location !== "undefined" && location.protocol === "https:";
    const base = `Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax;${
      secure ? " Secure;" : ""
    }`;
    document.cookie = `x-tenant-id=${encodeURIComponent(id)}; ${base}`;
    document.cookie = `tenant_id=${encodeURIComponent(id)}; ${base}`;
  } catch {
    /* noop */
  }
}

/** Supabase セッションから tenant_id を引く（profiles.id = auth.uid() 想定） */
async function resolveTenantIdViaSupabase(): Promise<string | null> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user?.id) return null;

    type ProfileRow = { tenant_id: string | null };

    const resp = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    const row = (resp.data as ProfileRow | null) ?? null;
    if (!row) return null;

    const tid = row.tenant_id;
    if (isValidUuid(tid)) {
      setTenantCookies(tid);
      return tid;
    }
    return null;
  } catch {
    return null;
  }
}

/** Cookie → Supabase の順で解決し、見つかれば Cookie を整える */
async function ensureTenantId(): Promise<string | null> {
  const cookieTid = getTenantIdFromCookie();
  if (isValidUuid(cookieTid)) return cookieTid;
  const supaTid = await resolveTenantIdViaSupabase();
  return isValidUuid(supaTid) ? supaTid : null;
}

export default function JobBoardsManualPage() {
  const [sites, setSites] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [large, setLarge] = useState<string[]>([]);
  const [small, setSmall] = useState<string[]>([]);
  const [ages, setAges] = useState<string[]>([]);
  const [emps, setEmps] = useState<string[]>([]);
  const [sals, setSals] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [openCat, setOpenCat] = useState(false);
  const [openPref, setOpenPref] = useState(false);

  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<ManualFetchRow[]>([]);

  // 初回に tenant_id を可能なら Cookie へ整備しておく
  useEffect(() => {
    void (async () => {
      await ensureTenantId();
    })();
  }, []);

  const Chip: React.FC<{
    active: boolean;
    onClick: () => void;
    label: string;
  }> = ({ active, onClick, label }) => (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border ${
        active
          ? "bg-indigo-50 border-indigo-400 text-indigo-700"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      } mr-2 mb-2`}
    >
      {label}
    </button>
  );

  function TagMulti({
    values,
    setValues,
    options,
  }: {
    values: string[];
    setValues: (v: string[]) => void;
    options: string[];
  }) {
    const toggle = (v: string) =>
      setValues(
        values.includes(v) ? values.filter((x) => x !== v) : [...values, v]
      );
    return (
      <div className="flex flex-wrap">
        <Chip
          active={values.length === options.length}
          label="すべて"
          onClick={() => setValues(options)}
        />
        <Chip
          active={values.length === 0}
          label="解除"
          onClick={() => setValues([])}
        />
        {options.map((o) => (
          <Chip
            key={o}
            label={o}
            active={values.includes(o)}
            onClick={() => toggle(o)}
          />
        ))}
      </div>
    );
  }

  const run = async () => {
    if (running) return;
    setRunning(true);
    setMsg("");
    setRows([]);
    try {
      const tenant = await ensureTenantId();
      if (!isValidUuid(tenant)) {
        setRunning(false);
        setMsg(
          "テナントID（UUID）が見つかりません。ログイン後、または x-tenant-id クッキー/ヘッダを設定してください。"
        );
        return;
      }

      const resp = await fetch("/api/job-boards/manual/run-batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenant,
        },
        body: JSON.stringify({
          sites,
          large,
          small,
          age: ages,
          emp: emps,
          sal: sals,
          pref: prefs,
          want: 200,
          saveMode: "history", // 履歴へ保存
        }),
      });

      const j = await resp.json();
      if (!resp.ok || !j?.ok) throw new Error(j?.error || "run failed");

      setRows((j?.preview as ManualFetchRow[]) ?? []);
      setMsg(
        j?.note ||
          (j?.history_id ? `履歴に保存しました（ID: ${j.history_id}）` : "")
      );
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              転職サイト 手動実行
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              ログイン情報を利用して件数を取得。結果は「手動実行履歴」に保存。
            </p>
          </div>
          <Link
            href="/job-boards/manual/history"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            手動実行履歴へ
          </Link>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4 space-y-4">
          {/* サイト */}
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600">
              サイト
            </div>
            <div className="flex flex-wrap">
              <Chip
                active={sites.length === SITE_OPTIONS.length}
                label="すべて"
                onClick={() => setSites(SITE_OPTIONS.map((s) => s.value))}
              />
              <Chip
                active={sites.length === 0}
                label="解除"
                onClick={() => setSites([])}
              />
              {SITE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={sites.includes(o.value)}
                  onClick={() =>
                    setSites(
                      sites.includes(o.value)
                        ? sites.filter((x) => x !== o.value)
                        : [...sites, o.value]
                    )
                  }
                />
              ))}
            </div>
          </div>

          {/* 職種 */}
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600">
              職種
            </div>
            <button
              className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
              onClick={() => setOpenCat(true)}
            >
              選択（大:{large.length || "すべて"} / 小:
              {small.length || "すべて"}）
            </button>
          </div>

          {/* 都道府県 */}
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600">
              都道府県
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                onClick={() => setOpenPref(true)}
              >
                選択（{prefs.length ? `${prefs.length}件` : "全国"}）
              </button>
              {prefs.length > 0 && (
                <button
                  className="px-2 py-1 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                  onClick={() => setPrefs([])}
                >
                  クリア
                </button>
              )}
            </div>
          </div>

          {/* 年齢/雇用/年収 */}
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600">
              年齢層
            </div>
            <TagMulti values={ages} setValues={setAges} options={AGE_BANDS} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600">
              雇用形態
            </div>
            <TagMulti values={emps} setValues={setEmps} options={EMP_TYPES} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600">
              年収帯
            </div>
            <TagMulti values={sals} setValues={setSals} options={SALARY_BAND} />
          </div>

          <div className="pt-2">
            <button
              onClick={run}
              disabled={running || sites.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {running && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    opacity="0.25"
                  />
                  <path
                    d="M22 12a10 10 0 00-10-10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                </svg>
              )}
              実行する
            </button>
          </div>

          {msg && (
            <pre className="whitespace-pre-wrap text-xs text-neutral-600">
              {msg}
            </pre>
          )}
        </section>

        {/* 結果表 */}
        <section className="mt-6 rounded-2xl border border-neutral-200 p-4">
          <div className="text-sm font-semibold mb-2">
            取得結果（今回の手動実行）
          </div>
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">サイト</th>
                  <th className="px-3 py-3 text-left">大分類</th>
                  <th className="px-3 py-3 text-left">小分類</th>
                  <th className="px-3 py-3 text-left">都道府県</th>
                  <th className="px-3 py-3 text-left">年齢層</th>
                  <th className="px-3 py-3 text-left">雇用形態</th>
                  <th className="px-3 py-3 text-left">年収帯</th>
                  <th className="px-3 py-3 text-right">求人数</th>
                  <th className="px-3 py-3 text-right">求職者数</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      まだ結果がありません
                    </td>
                  </tr>
                ) : (
                  (rows ?? []).map((r, i) => (
                    <tr key={i} className="border-t border-neutral-200">
                      <td className="px-3 py-3">{r.site_key}</td>
                      <td className="px-3 py-3">{r.internal_large ?? "-"}</td>
                      <td className="px-3 py-3">{r.internal_small ?? "-"}</td>
                      <td className="px-3 py-3">{r.prefecture ?? "-"}</td>
                      <td className="px-3 py-3">{r.age_band ?? "-"}</td>
                      <td className="px-3 py-3">{r.employment_type ?? "-"}</td>
                      <td className="px-3 py-3">{r.salary_band ?? "-"}</td>
                      <td className="px-3 py-3 text-right">
                        {r.jobs_count ?? 0}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {r.candidates_count ?? 0}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* モーダル */}
      {openCat && (
        <JobCategoryModal
          large={large}
          small={small}
          onCloseAction={() => setOpenCat(false)}
          onApplyAction={(L, S) => {
            setLarge(L);
            setSmall(S);
            setOpenCat(false);
          }}
        />
      )}
      {openPref && (
        <PrefectureModal
          selected={prefs}
          onCloseAction={() => setOpenPref(false)}
          onApplyAction={(p) => {
            setPrefs(p);
            setOpenPref(false);
          }}
        />
      )}
    </>
  );
}
