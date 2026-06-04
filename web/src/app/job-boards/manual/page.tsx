// web/src/app/job-boards/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import type { ManualResultRow } from "@/server/job-boards/types";
import { PageHero, PageMain, SurfaceCard, StatChip } from "@/components/PageChrome";

// 職種モーダル
// ※ job/JobCategoryModal の named export を使う
const JobCategoryModal = dynamic(
  () =>
    import("@/components/job/JobCategoryModal").then(
      (mod) => mod.JobCategoryModal
    ),
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
 * 共通 Chip コンポーネント
 * ========================= */

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

/** =========================
 * 手動実行ページ 用の定数
 * ========================= */

const SITE_OPTIONS: { value: string; label: string }[] = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];

// site_key → 表示用ラベルのマップ
const SITE_LABEL_MAP: Record<string, string> = SITE_OPTIONS.reduce((acc, s) => {
  acc[s.value] = s.label;
  return acc;
}, {} as Record<string, string>);

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

function isAbortError(err: any) {
  return err?.name === "AbortError";
}

/** =========================
 * 条件設定モーダル
 * ========================= */

type ConditionModalProps = {
  open: boolean;
  action: "jobs" | "candidates" | null;
  running: boolean;
  onClose: () => void;
  onExecute: () => void;
  sites: string[];
  setSites: (s: string[]) => void;
  large: string[];
  small: string[];
  prefs: string[];
  onOpenJobModal: () => void;
  onOpenPrefModal: () => void;
};

const ConditionModal: React.FC<ConditionModalProps> = ({
  open,
  action,
  running,
  onClose,
  onExecute,
  sites,
  setSites,
  large,
  small,
  prefs,
  onOpenJobModal,
  onOpenPrefModal,
}) => {
  if (!open) return null;

  const actionLabel = action === "candidates" ? "求職者数" : "求人件数";
  const toggleSite = (value: string) => {
    setSites(
      sites.includes(value)
        ? sites.filter((x) => x !== value)
        : [...sites, value]
    );
  };

  const allSiteValues = SITE_OPTIONS.map((s) => s.value);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="w-[720px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div>
            <div className="font-semibold text-sm">
              {actionLabel}取得の条件設定
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              対象サイト、職種、都道府県を確認してから実行します。
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {/* サイト */}
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600">
              サイト
            </div>
            <div className="flex flex-wrap">
              <Chip
                active={sites.length === allSiteValues.length}
                label="すべて"
                onClick={() => setSites(allSiteValues)}
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
                  onClick={() => toggleSite(o.value)}
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
              className="px-3 py-2 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
              onClick={onOpenJobModal}
            >
              職種を選択（大: {large.length || "すべて"} / 小:{" "}
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
                className="px-3 py-2 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50"
                onClick={onOpenPrefModal}
              >
                都道府県を選択（
                {prefs.length ? `${prefs.length}件` : "全国"}）
              </button>
              {prefs.length > 0 && (
                <button
                  className="px-2 py-1 text-[11px] rounded-lg border border-neutral-300 hover:bg-neutral-50"
                  onClick={onOpenPrefModal}
                >
                  変更
                </button>
              )}
            </div>
          </div>

          {/* 現在の要約 */}
          <div className="mt-2 rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-xs text-neutral-600">
            <div className="font-medium text-neutral-700 mb-1">
              現在の条件サマリ
            </div>
            <div>
              サイト:{" "}
              {sites.length
                ? sites.map((s) => SITE_LABEL_MAP[s] ?? s).join(" / ")
                : "未選択"}
            </div>
            <div className="mt-1">
              職種: 大分類 {large.length || 0} / 小分類 {small.length || 0}
            </div>
            <div className="mt-1">
              都道府県:{" "}
              {prefs.length ? `${prefs.length}件選択中` : "全国（指定なし）"}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200">
          <button
            onClick={onClose}
            disabled={running}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-xs hover:bg-neutral-50"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={onExecute}
            disabled={running || sites.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-900 bg-neutral-950 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-900 disabled:opacity-50 disabled:hover:bg-neutral-950"
          >
            {running && (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  opacity="0.25"
                />
                <path
                  d="M22 12a10 10 0 00-10-10"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                />
              </svg>
            )}
            この条件で{actionLabel}を取得する
          </button>
        </div>
      </div>
    </div>
  );
};

/** =========================
 * 条件ごとの結果 → 1つの集計にまとめる
 * ========================= */

function aggregateManualRows(rows: ManualResultRow[]): ManualResultRow | null {
  if (!rows || rows.length === 0) return null;

  const { jobsTotal, hasJobs, candidatesTotal, hasCandidates } = rows.reduce(
    (acc, r) => {
      if (typeof r.jobs_total === "number") {
        acc.jobsTotal += r.jobs_total;
        acc.hasJobs = true;
      }
      if (typeof r.candidates_total === "number") {
        acc.candidatesTotal += r.candidates_total;
        acc.hasCandidates = true;
      }
      return acc;
    },
    {
      jobsTotal: 0,
      hasJobs: false,
      candidatesTotal: 0,
      hasCandidates: false,
    }
  );

  return {
    site_key: "all",
    internal_large: null,
    internal_small: null,
    prefecture: null,
    jobs_total: hasJobs ? jobsTotal : null,
    candidates_total: hasCandidates ? candidatesTotal : null,
  } as ManualResultRow;
}

// サイト別サマリ用型 & ビルダー
type SiteSummary = {
  siteKey: string;
  label: string;
  summary: ManualResultRow;
  patternCount: number;
};

function buildSiteSummaries(rows: ManualResultRow[]): SiteSummary[] {
  if (!rows || rows.length === 0) return [];

  const bySite = new Map<string, ManualResultRow[]>();

  for (const r of rows) {
    const key = r.site_key || "unknown";
    const list = bySite.get(key);
    if (list) list.push(r);
    else bySite.set(key, [r]);
  }

  const result: SiteSummary[] = [];
  for (const [siteKey, siteRows] of bySite.entries()) {
    const agg = aggregateManualRows(siteRows);
    if (!agg) continue;

    result.push({
      siteKey,
      label: SITE_LABEL_MAP[siteKey] ?? siteKey,
      summary: { ...agg, site_key: siteKey },
      patternCount: siteRows.length,
    });
  }

  return result.sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

/** =========================
 * 条件別 詳細テーブル（色グルーピング & サイト名略記）
 * ========================= */

const DetailedResultTable: React.FC<{ rows: ManualResultRow[] }> = ({
  rows,
}) => {
  if (!rows || rows.length === 0) {
    return null;
  }

  const sorted = [...rows].sort((a, b) => {
    const aSite = a.site_key || "";
    const bSite = b.site_key || "";
    if (aSite !== bSite) return aSite.localeCompare(bSite, "ja");

    const aLarge = a.internal_large || "";
    const bLarge = b.internal_large || "";
    if (aLarge !== bLarge) return aLarge.localeCompare(bLarge, "ja");

    const aSmall = a.internal_small || "";
    const bSmall = b.internal_small || "";
    if (aSmall !== bSmall) return aSmall.localeCompare(bSmall, "ja");

    const aPref = a.prefecture || "";
    const bPref = b.prefecture || "";
    return aPref.localeCompare(bPref, "ja");
  });

  // グループ（サイト × 大分類 × 小分類）ごとに色分け
  let prevGroupKey = "";
  let groupIndex = -1;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-neutral-50 text-xs font-semibold text-neutral-700">
        条件別の内訳
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-neutral-600 whitespace-nowrap">
                サイト
              </th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600 whitespace-nowrap">
                職種（大分類コード）
              </th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600 whitespace-nowrap">
                職種（小分類コード）
              </th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600 whitespace-nowrap">
                都道府県
              </th>
              <th className="px-3 py-2 text-right font-medium text-neutral-600 whitespace-nowrap">
                求人件数
              </th>
              <th className="px-3 py-2 text-right font-medium text-neutral-600 whitespace-nowrap">
                求職者数
              </th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600 whitespace-nowrap">
                取得できなかった理由
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              const siteLabelRaw =
                SITE_LABEL_MAP[r.site_key ?? ""] ?? r.site_key ?? "-";
              const largeTextRaw = r.internal_large ?? "（指定なし）";
              const smallTextRaw = r.internal_small ?? "（指定なし）";

              // サイト × 大分類 × 小分類 で1グループ
              const groupKey = `${siteLabelRaw}||${largeTextRaw}||${smallTextRaw}`;
              const isNewGroup = groupKey !== prevGroupKey;
              if (isNewGroup) {
                groupIndex += 1;
                prevGroupKey = groupKey;
              }

              const groupBgClass =
                groupIndex % 2 === 0 ? "bg-white" : "bg-indigo-50/40"; // まとまりごとに薄く色を変える

              // 同じグループの2行目以降は サイト名・職種を省略表示
              const siteLabel = isNewGroup ? siteLabelRaw : "";
              const largeText = isNewGroup ? largeTextRaw : "";
              const smallText = isNewGroup ? smallTextRaw : "";

              const jobsTotal = r.jobs_total;
              const hasJobs = typeof jobsTotal === "number";
              const jobsValue = hasJobs
                ? `${jobsTotal.toLocaleString()}件`
                : r.error_reason
                  ? "取得失敗"
                  : "-";
              const candidatesTotal = r.candidates_total;
              const hasCandidates = typeof candidatesTotal === "number";
              const candidatesValue = hasCandidates
                ? `${candidatesTotal.toLocaleString()}名`
                : r.candidates_error_reason
                  ? "取得失敗"
                  : "-";
              const reasonParts = [
                hasJobs || !r.error_reason
                  ? null
                  : `求人: ${r.error_reason}`,
                hasCandidates || !r.candidates_error_reason
                  ? null
                  : `求職者: ${r.candidates_error_reason}`,
              ].filter(Boolean);
              const reasonText = reasonParts.length
                ? reasonParts.join(" / ")
                : "-";

              return (
                <tr
                  key={`${r.site_key}-${r.internal_large}-${r.internal_small}-${r.prefecture}-${idx}`}
                  className={`border-t border-neutral-100 ${groupBgClass} hover:bg-neutral-50/80`}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {siteLabel || <span className="text-neutral-300">﹡</span>}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {largeText || <span className="text-neutral-300">﹡</span>}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {smallText || <span className="text-neutral-300">﹡</span>}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {r.prefecture ?? "全国（指定なし）"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {jobsValue}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {candidatesValue}
                  </td>
                  <td className="px-3 py-1.5 text-neutral-600">
                    {reasonText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** =========================
 * 手動実行ページ本体
 * ========================= */

export default function JobBoardsManualPage() {
  const [sites, setSites] = useState<string[]>(
    SITE_OPTIONS.map((s) => s.value)
  );
  const [large, setLarge] = useState<string[]>([]);
  const [small, setSmall] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);

  const [openCat, setOpenCat] = useState(false);
  const [openPref, setOpenPref] = useState(false);
  const [conditionAction, setConditionAction] = useState<
    "jobs" | "candidates" | null
  >(null);

  const [running, setRunning] = useState(false);
  const [runningAction, setRunningAction] = useState<
    "jobs" | "candidates" | null
  >(null);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<ManualResultRow[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef(false);

  // 進捗表示用
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressDisplay, setProgressDisplay] = useState(0);

  // 初回に tenant_id を可能なら Cookie へ整備しておく
  useEffect(() => {
    void (async () => {
      await ensureTenantId();
    })();
  }, []);

  // 疑似プログレス
  useEffect(() => {
    if (!running || progressTotal <= 0) return;

    setProgressDisplay(0);

    const id = window.setInterval(() => {
      setProgressDisplay((prev) => {
        if (prev >= progressTotal - 1) return prev;
        return prev + 1;
      });
    }, 500);

    return () => window.clearInterval(id);
  }, [running, progressTotal]);

  /** 求人件数の取得 */
  const run = async () => {
    if (running) return;
    setRunning(true);
    setRunningAction("jobs");
    setMsg("");
    setRows([]);
    cancelRef.current = false;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const siteCount = sites.length || 0;
    const largeCount = large.length || 1;
    const smallCount = small.length || 1;
    const prefCount = prefs.length || 1;
    const baseUnits = siteCount * largeCount * smallCount * prefCount;
    const totalSteps = baseUnits > 0 ? baseUnits * 10 : 0;
    setProgressTotal(totalSteps);

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
          pref: prefs,
          want: 50,
          saveMode: "history",
        }),
        signal,
      });

      const j: any = await resp.json();
      if (!resp.ok || !j?.ok) {
        throw new Error(j?.error || `run failed (${resp.status})`);
      }

      setRows((j?.preview as ManualResultRow[]) ?? []);

      const text =
        j?.note ||
        (j?.history_id ? `履歴に保存しました（ID: ${j.history_id}）` : "");

      setMsg(text);

      setProgressDisplay(totalSteps);
    } catch (e: any) {
      if (isAbortError(e) || cancelRef.current) {
        setMsg("求人件数の取得を中止しました。");
        setProgressTotal(0);
        setProgressDisplay(0);
        return;
      }
      setMsg(String(e?.message || e));
    } finally {
      setRunning(false);
      setRunningAction(null);
    }
  };

  /** 求職者の取得 */
  const fetchCandidates = async () => {
    if (running) return;
    setRunning(true);
    setRunningAction("candidates");

    setProgressTotal(0);
    setProgressDisplay(0);
    cancelRef.current = false;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      const tenant = await ensureTenantId();
      if (!isValidUuid(tenant)) {
        setRunning(false);
        setMsg((prev) => {
          const add =
            "【求職者取得】テナントID（UUID）が見つかりません。ログイン後、または x-tenant-id クッキー/ヘッダを設定してください。";
          return prev ? `${prev}\n\n${add}` : add;
        });
        return;
      }

      const resp = await fetch("/api/job-boards/manual/fetch-candidates", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenant,
        },
        body: JSON.stringify({
          sites,
          large,
          small,
          pref: prefs,
          scoutUrls: {},
        }),
        signal,
      });

      const j: any = await resp.json();
      if (!resp.ok || !j?.ok) {
        throw new Error(j?.error || `fetch-candidates failed (${resp.status})`);
      }

      let text = "【求職者取得】処理が完了しました。";

      if (typeof j?.fetchedCount === "number") {
        text += `\n取得した求職者数: ${j.fetchedCount}件`;
      }

      if (j?.history_id) {
        text += `\n履歴に保存しました（ID: ${j.history_id}）`;
      } else if (j?.history_error) {
        text += `\n履歴保存に失敗しました: ${j.history_error}`;
      }

      if (Array.isArray(j?.results) && j.results.length > 0) {
        const nextRows: ManualResultRow[] = j.results.map((r: any) => ({
          site_key: r.siteKey,
          internal_large: r.internalLarge ?? null,
          internal_small: r.internalSmall ?? null,
          prefecture: r.prefecture ?? null,
          jobs_total: null,
          candidates_total:
            typeof r.total === "number" && Number.isFinite(r.total)
              ? r.total
              : null,
          candidates_error_reason: r.errorMessage ?? null,
        }));
        setRows(nextRows);

        text += "\n\nサイト別結果:\n";
        for (const r of j.results) {
          const label = SITE_LABEL_MAP[r.siteKey] || r.siteKey;
          if (typeof r.total === "number") {
            text += `- ${label}: ${r.total}名\n`;
          } else {
            text += `- ${label}: 取得失敗（${r.errorMessage || "unknown"}）\n`;
          }
        }
      }

      setMsg((prev) => (prev ? `${prev}\n\n${text}` : text));
    } catch (e: any) {
      if (isAbortError(e) || cancelRef.current) {
        setMsg((prev) => {
          const add = "【求職者取得】中止しました。";
          return prev ? `${prev}\n\n${add}` : add;
        });
        return;
      }
      setMsg((prev) => {
        const add = `【求職者取得】エラー: ${String(e?.message || e)}`;
        return prev ? `${prev}\n\n${add}` : add;
      });
    } finally {
      setRunning(false);
      setRunningAction(null);
    }
  };

  const cancelRunning = () => {
    if (!running) return;
    cancelRef.current = true;
    abortRef.current?.abort();
    const label =
      runningAction === "candidates" ? "求職者取得" : "求人件数取得";
    setMsg((prev) =>
      prev
        ? `${prev}\n\n${label}を中止しています…`
        : `${label}を中止しています…`
    );
  };

  const executeConditionAction = () => {
    const action = conditionAction;
    if (!action) return;
    setConditionAction(null);
    if (action === "candidates") {
      void fetchCandidates();
      return;
    }
    void run();
  };

  const currentConditionSummary = useMemo(() => {
    const siteLabels =
      sites.length === 0
        ? "未選択"
        : SITE_OPTIONS.filter((s) => sites.includes(s.value))
            .map((s) => s.label)
            .join(" / ");

    const prefText = prefs.length
      ? `${prefs.slice(0, 3).join("、")}${
          prefs.length > 3 ? ` ほか${prefs.length - 3}件` : ""
        }`
      : "全国（指定なし）";

    return {
      siteLabels,
      prefText,
    };
  }, [sites, prefs]);

  const progressText =
    progressTotal > 0
      ? `${progressDisplay}/${progressTotal} (${Math.round(
          (progressDisplay / progressTotal) * 100
        )}%)`
      : "";

  const perSiteSummaries = useMemo(() => buildSiteSummaries(rows), [rows]);
  const hasResults = rows.length > 0;

  return (
    <>
      <AppHeader showBack />
      <PageMain className="space-y-6">
        <PageHero
          eyebrow="Manual Research"
          title="転職サイトの手動実行を統一 UI で操作"
          description="サイト、職種、都道府県の条件設定から求人件数・求職者数の取得、結果確認までを一画面で進められます。"
          accent="gold"
          actions={[
            { href: "/job-boards/manual/history", label: "手動実行履歴へ", variant: "secondary" },
          ]}
        />

        <SurfaceCard>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <StatChip label="対象サイト" value={sites.length || "未選択"} />
            <StatChip label="都道府県" value={prefs.length || "全国"} />
            <StatChip label="取得結果" value={rows.length || 0} />
            <StatChip
              label="進捗"
              value={progressText || (running ? "実行中" : "待機中")}
            />
          </div>
        </SurfaceCard>

        {(running || progressTotal > 0) && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            <div className="flex items-center gap-2">
              {running && (
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    opacity="0.25"
                  />
                  <path
                    d="M22 12a10 10 0 00-10-10"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                  />
                </svg>
              )}
              <span>
                {running
                  ? "処理を実行中です…"
                  : "求人件数取得が完了しました。"}
              </span>
            </div>
            <div className="tabular-nums">{progressText}</div>
          </div>
        )}

        {/* 実行条件サマリ & 実行ボタン */}
        <SurfaceCard className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-neutral-600 mb-1">
                現在の実行条件
              </div>
              <div className="text-sm text-neutral-800">
                <div>サイト: {currentConditionSummary.siteLabels}</div>
                <div className="mt-1">
                  職種: 大分類 {large.length || 0} / 小分類 {small.length || 0}
                </div>
                <div className="mt-1">
                  都道府県: {currentConditionSummary.prefText}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConditionAction("jobs")}
                  disabled={running}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 px-4 py-2 text-xs font-medium text-neutral-900 hover:bg-indigo-900 hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-neutral-900"
                >
                  求人件数を取得する
                </button>

                <button
                  type="button"
                  onClick={() => setConditionAction("candidates")}
                  disabled={running}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 px-4 py-2 text-xs font-medium text-neutral-900 hover:bg-indigo-900 hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-neutral-900"
                >
                  求職者数を取得する
                </button>

                {running && (
                  <button
                    type="button"
                    onClick={cancelRunning}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-300 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    中止する
                  </button>
                )}
              </div>
            </div>
          </div>

          {msg && (
            <div className="whitespace-pre-line border-t border-neutral-200 pt-3 mt-2 text-xs text-neutral-600">
              {msg}
            </div>
          )}
        </SurfaceCard>

        {/* 結果表示 → サイト別集計 + 条件別テーブル */}
        <SurfaceCard className="space-y-6">
          <div className="text-sm font-semibold">取得結果</div>

          {!hasResults ? (
            <div className="px-4 py-10 text-center text-neutral-400 text-sm">
              まだ結果がありません。取得ボタンから条件を指定して実行してください。
            </div>
          ) : (
            <>
              {/* サイト別内訳（合計だけ） */}
              {perSiteSummaries.length > 0 && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold text-neutral-600">
                    サイト別の合計
                  </div>
                  {perSiteSummaries.map((site) => (
                    <div
                      key={site.siteKey}
                      className="rounded-xl border border-neutral-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-neutral-500 mb-1">
                            {site.label} の集計条件
                          </div>
                          <div className="text-sm text-neutral-900 space-y-1">
                            <div>サイト: {site.label}</div>
                            <div>
                              職種: 大分類 {large.length || 0} / 小分類{" "}
                              {small.length || 0}
                            </div>
                            <div>
                              都道府県:{" "}
                              {prefs.length
                                ? `${prefs.slice(0, 5).join("、")}${
                                    prefs.length > 5
                                      ? ` ほか${prefs.length - 5}件`
                                      : ""
                                  }`
                                : "全国（指定なし）"}
                            </div>
                            <div className="text-xs text-neutral-500 mt-1">
                              ※ このサイト内の {site.patternCount}
                              パターンを合算した値です
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-right">
                          <div>
                            <div className="text-xs text-neutral-500">
                              求人件数
                            </div>
                            <div className="text-lg font-semibold tabular-nums">
                              {typeof site.summary.jobs_total === "number"
                                ? `${site.summary.jobs_total.toLocaleString()}件`
                                : "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">
                              求職者数
                            </div>
                            <div className="text-lg font-semibold tabular-nums">
                              {typeof site.summary.candidates_total === "number"
                                ? `${site.summary.candidates_total.toLocaleString()}名`
                                : "-"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 条件別テーブル */}
              <DetailedResultTable rows={rows} />

            </>
          )}
        </SurfaceCard>
      </PageMain>

      {/* 条件設定モーダル */}
      <ConditionModal
        open={conditionAction !== null}
        action={conditionAction}
        running={running}
        onClose={() => setConditionAction(null)}
        onExecute={executeConditionAction}
        sites={sites}
        setSites={setSites}
        large={large}
        small={small}
        prefs={prefs}
        onOpenJobModal={() => setOpenCat(true)}
        onOpenPrefModal={() => setOpenPref(true)}
      />

      {/* 職種モーダル */}
      {openCat && (
        <JobCategoryModal
          onClose={() => setOpenCat(false)}
          initialSelectedLargeIds={large}
          initialSelectedSmallIds={small}
          onApply={({
            largeIds,
            smallIds,
          }: {
            largeIds: string[];
            smallIds: string[];
          }) => {
            // 小分類 → 親の大分類にチェックが入るロジックは JobCategoryModal 内で実装済み
            setLarge(largeIds);
            setSmall(smallIds);
            setOpenCat(false);
          }}
        />
      )}

      {/* 都道府県モーダル */}
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
