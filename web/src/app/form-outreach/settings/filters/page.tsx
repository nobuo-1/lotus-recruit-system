// web/src/app/form-outreach/settings/filters/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

/** =========================
 * 定数
 * ========================= */

// 従業員規模
const SIZE_OPTS = ["1-9", "10-49", "50-249", "250+"] as const;

// 47都道府県を地方ごとに
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

// 業種（日本標準産業分類を意識した大分類）
const INDUSTRY_LARGE = [
  "農林水産",
  "鉱業・採石",
  "建設",
  "製造（食品・生活）",
  "製造（素材・化学・資源）",
  "製造（機械・電機・輸送）",
  "エネルギー・公益",
  "情報通信・メディア",
  "運輸・物流・郵便",
  "卸売",
  "小売",
  "金融・保険・不動産",
  "専門サービス・士業",
  "宿泊・飲食",
  "生活関連・娯楽・スポーツ",
  "教育・学習支援",
  "医療・福祉",
  "公務・団体・NPO",
  "環境・安全・インフラ保全",
  "人材・BPO",
  "レンタル・リース・シェア",
  "その他サービス",
] as const;

type IndustryLarge = (typeof INDUSTRY_LARGE)[number];

const INDUSTRY_CATEGORIES: Record<IndustryLarge, readonly string[]> = {
  農林水産: ["農業", "畜産", "園芸", "林業", "水産業", "水産加工"],
  "鉱業・採石": ["鉱業", "採石業", "砂利・土石採取"],
  建設: [
    "総合工事",
    "土木工事",
    "建築工事",
    "建築設計",
    "測量・地質調査",
    "内装仕上げ",
    "電気工事",
    "管工事・空調",
    "設備工事",
    "解体工事",
    "リフォーム",
  ],
  "製造（食品・生活）": [
    "食料品製造",
    "飲料・酒類",
    "たばこ",
    "飼料",
    "繊維工業",
    "衣服・アパレル",
    "皮革・靴",
    "木材・木製品",
    "家具・装備品",
    "紙・パルプ",
    "印刷・製本",
    "ゴム製品",
    "プラスチック製品",
  ],
  "製造（素材・化学・資源）": [
    "化学工業",
    "医薬品",
    "化粧品・トイレタリー",
    "石油製品",
    "石炭製品",
    "窯業・土石",
    "セメント",
    "ガラス・ガラス製品",
    "鉄鋼",
    "非鉄金属",
    "金属製品",
  ],
  "製造（機械・電機・輸送）": [
    "一般機械",
    "産業機械",
    "ロボット",
    "電気機械",
    "電子部品・半導体",
    "情報通信機器",
    "精密機器",
    "計測機器",
    "医療機器",
    "輸送用機器（自動車・航空機・造船）",
    "自動車部品",
    "その他製造",
  ],
  "エネルギー・公益": [
    "電力",
    "ガス",
    "熱供給",
    "水道",
    "再生可能エネルギー",
    "エネルギー商社",
    "送配電",
    "プラントエンジ",
  ],
  "情報通信・メディア": [
    "ソフトウェア",
    "受託開発・SI",
    "SaaS",
    "クラウド・データセンター",
    "通信（キャリア/ISP）",
    "インターネットサービス",
    "プラットフォーム",
    "コンテンツ制作",
    "アニメ/ゲーム",
    "放送",
    "出版・メディア",
  ],
  "運輸・物流・郵便": [
    "鉄道",
    "バス・タクシー",
    "道路貨物（トラック）",
    "倉庫",
    "物流・3PL",
    "宅配・ラストマイル",
    "海運",
    "空運",
    "フォワーダー",
    "郵便",
  ],
  卸売: [
    "総合商社",
    "専門商社",
    "機械器具卸",
    "化学品卸",
    "建材・金物卸",
    "食品・飲料卸",
    "繊維・衣料卸",
    "医薬品卸",
    "自動車・部品卸",
    "IT機器卸",
    "その他卸",
  ],
  小売: [
    "百貨店・総合小売",
    "スーパーマーケット",
    "コンビニ",
    "ドラッグストア",
    "専門小売（家電・家具・衣料・スポーツ・書籍）",
    "ホームセンター",
    "EC・ネット通販",
    "自動車小売",
    "リユース・リサイクルショップ",
  ],
  "金融・保険・不動産": [
    "銀行",
    "信金・信組",
    "証券",
    "投資・VC/PE",
    "リース・クレジット",
    "決済・フィンテック",
    "保険（生保・損保・代理店）",
    "不動産開発",
    "不動産仲介",
    "不動産管理・PM",
    "駐車場",
    "REIT",
  ],
  "専門サービス・士業": [
    "法律（弁護士）",
    "会計（公認会計士/税理士）",
    "社労士",
    "司法書士・行政書士",
    "コンサル（戦略/IT/業務）",
    "監査・アドバイザリー",
    "調査・リサーチ",
    "翻訳・通訳",
    "デザイン・クリエイティブ",
    "広告代理店",
    "PR・ブランディング",
    "イベント・展示会",
  ],
  "宿泊・飲食": [
    "ホテル・旅館",
    "民泊・簡易宿所",
    "飲食店（レストラン・カフェ・バー）",
    "フードデリバリー/ケータリング",
  ],
  "生活関連・娯楽・スポーツ": [
    "理美容・エステ",
    "クリーニング",
    "旅行業",
    "冠婚葬祭",
    "スポーツ・フィットネス",
    "娯楽・アミューズメント",
    "テーマパーク",
    "ペット関連",
  ],
  "教育・学習支援": [
    "学校教育",
    "幼稚園・保育園",
    "学習塾・予備校",
    "語学・カルチャー",
    "企業研修・人材育成",
    "オンライン教育",
  ],
  "医療・福祉": [
    "病院・クリニック",
    "歯科",
    "調剤薬局",
    "介護・福祉施設",
    "訪問看護・介護",
    "医療系サービス",
    "保育",
  ],
  "公務・団体・NPO": [
    "官公庁・自治体",
    "独立行政法人",
    "公社・公団",
    "業界団体・組合",
    "国際機関",
    "NPO/NGO",
    "公益法人",
  ],
  "環境・安全・インフラ保全": [
    "廃棄物処理・リサイクル",
    "環境コンサル/計測",
    "ビルメンテナンス",
    "清掃・警備",
    "設備保全",
    "インフラ保全",
  ],
  "人材・BPO": [
    "人材紹介",
    "人材派遣",
    "求人媒体・HRテック",
    "BPO/アウトソーシング",
    "コールセンター",
    "SES",
  ],
  "レンタル・リース・シェア": [
    "レンタル（機器・車両・スペース）",
    "カーシェア/モビリティ",
    "シェアオフィス/スペース",
    "レンタルスペース",
  ],
  その他サービス: [
    "写真・映像",
    "印刷サービス",
    "修理・メンテナンス",
    "配管・水回り",
    "ハウスクリーニング",
    "その他サービス",
  ],
} as const;

/** =========================
 * 型
 * ========================= */
type Filters = {
  prefectures: string[];
  employee_size_ranges: string[];
  keywords: string[];
  industries_large: IndustryLarge[];
  industries_small: string[];
  // ★ 追加
  capital_min: number | null;
  capital_max: number | null;
  established_from: string | null; // YYYY-MM-DD
  established_to: string | null; // YYYY-MM-DD
  updated_at?: string | null;
};

/** =========================
 * 画面
 * ========================= */
export default function FiltersPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    prefectures: [],
    employee_size_ranges: [],
    keywords: [],
    industries_large: [],
    industries_small: [],
    capital_min: null,
    capital_max: null,
    established_from: null,
    established_to: null,
    updated_at: null,
  });

  // モーダル開閉
  const [prefModalOpen, setPrefModalOpen] = useState(false);
  const [indModalOpen, setIndModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // 1) テナント
        let me: any = null;
        let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
        if (!meRes.ok)
          meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
        me = meRes.ok ? await safeJson(meRes) : null;
        const tId: string | null =
          me?.profile?.tenant_id ?? me?.tenant_id ?? null;
        setTenantId(tId);

        // 2) フィルタ読み込み
        const fRes = await fetch("/api/form-outreach/settings/filters", {
          cache: "no-store",
          headers: tId ? { "x-tenant-id": tId } : undefined,
        });
        const j = fRes.ok ? await safeJson(fRes) : {};
        const incoming = j?.filters ?? {};

        const numOrNull = (v: any) =>
          typeof v === "number" && Number.isFinite(v) ? v : null;
        const strOrNull = (v: any) => (typeof v === "string" && v ? v : null);

        setFilters((prev) => ({
          ...prev,
          prefectures: Array.isArray(incoming.prefectures)
            ? incoming.prefectures
            : [],
          employee_size_ranges: Array.isArray(incoming.employee_size_ranges)
            ? incoming.employee_size_ranges
            : [],
          keywords: Array.isArray(incoming.keywords) ? incoming.keywords : [],
          industries_large: toIndustryLarge(incoming.industries_large),
          industries_small: Array.isArray(incoming.industries_small)
            ? incoming.industries_small
            : Array.isArray(incoming.industries)
            ? incoming.industries
            : Array.isArray(incoming.job_titles)
            ? incoming.job_titles
            : [],
          // ★ 追加
          capital_min: numOrNull(incoming.capital_min),
          capital_max: numOrNull(incoming.capital_max),
          established_from: strOrNull(incoming.established_from),
          established_to: strOrNull(incoming.established_to),

          updated_at: incoming.updated_at ?? null,
        }));
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, []);

  const save = async () => {
    if (loading) return;
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch("/api/form-outreach/settings/filters", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        },
        body: JSON.stringify({ filters }),
      });
      const j = await safeJson(r);
      if (!r.ok) throw new Error(j?.error || "save failed");
      setFilters((f) => ({ ...f, updated_at: j?.filters?.updated_at ?? null }));
      setMsg("保存しました。");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  /** ====== サマリ表示 ====== */
  const summaryPref = useMemo(() => {
    const n = filters.prefectures.length;
    if (n === 0) return "（全国）";
    return n <= 6 ? filters.prefectures.join(" / ") : `${n} 都道府県を選択中`;
  }, [filters.prefectures]);

  const summaryInd = useMemo(() => {
    const nL = filters.industries_large.length;
    const nS = filters.industries_small.length;
    if (nL === 0 && nS === 0) return "（未選択）";
    return `${nL}大分類 / ${nS}小分類を選択中`;
  }, [filters.industries_large, filters.industries_small]);

  const capitalSummary = useMemo(() => {
    const { capital_min, capital_max } = filters;
    const left = capital_min != null ? formatYen(capital_min) : "-";
    const right = capital_max != null ? formatYen(capital_max) : "-";
    return `${left} 〜 ${right}`;
  }, [filters.capital_min, filters.capital_max]);

  const establishedSummary = useMemo(() => {
    const { established_from, established_to } = filters;
    return `${established_from || "-"} 〜 ${established_to || "-"}`;
  }, [filters.established_from, filters.established_to]);

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              取得フィルタ設定
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span> /
              最終更新:{" "}
              {filters.updated_at ? formatTs(filters.updated_at) : "-"}
            </p>
          </div>
          <button
            onClick={save}
            disabled={loading}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? "保存中…" : "保存"}
          </button>
        </div>

        <section className="rounded-2xl border border-neutral-200 p-4 space-y-6">
          {/* 都道府県（モーダル起動） */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-800">
                  都道府県（複数選択可）
                </div>
                <div className="text-[11px] text-neutral-500">
                  {filters.prefectures.length
                    ? summaryPref
                    : "未選択 → 全国対象"}
                </div>
              </div>
              <button
                onClick={() => setPrefModalOpen(true)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                都道府県を選択
              </button>
            </div>

            {filters.prefectures.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {filters.prefectures.map((name) => (
                  <button
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs"
                    title="クリックで除外"
                    onClick={() =>
                      setFilters((s) => ({
                        ...s,
                        prefectures: s.prefectures.filter((x) => x !== name),
                      }))
                    }
                  >
                    {name} <span className="opacity-60">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <hr className="border-neutral-200" />

          {/* 従業員規模 */}
          <div>
            <div className="text-sm font-medium text-neutral-800 mb-1">
              従業員規模（任意）
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {SIZE_OPTS.map((opt) => {
                const checked = filters.employee_size_ranges.includes(opt);
                return (
                  <label key={opt} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          employee_size_ranges: e.target.checked
                            ? [...f.employee_size_ranges, opt]
                            : f.employee_size_ranges.filter((x) => x !== opt),
                        }))
                      }
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>

          <hr className="border-neutral-200" />

          {/* 資本金（範囲） */}
          <div>
            <div className="text-sm font-medium text-neutral-800 mb-2">
              資本金（範囲・任意）
            </div>
            <div className="flex items-center gap-3">
              <input
                className="w-56 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="下限（例: 3000万 / 3億 / 30000000）"
                defaultValue={filters.capital_min ?? ""}
                onBlur={(e) =>
                  setFilters((f) => ({
                    ...f,
                    capital_min: parseYenInput(e.target.value),
                  }))
                }
              />
              <span className="text-neutral-500">〜</span>
              <input
                className="w-56 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="上限（例: 5億 / 2億5000万 / 500000000）"
                defaultValue={filters.capital_max ?? ""}
                onBlur={(e) =>
                  setFilters((f) => ({
                    ...f,
                    capital_max: parseYenInput(e.target.value),
                  }))
                }
              />
              <div className="text-xs text-neutral-500">
                現在: {capitalSummary}
              </div>
            </div>
          </div>

          <hr className="border-neutral-200" />

          {/* 設立年月日（範囲） */}
          <div>
            <div className="text-sm font-medium text-neutral-800 mb-2">
              設立年月日（範囲・任意）
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={filters.established_from ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    established_from: e.target.value || null,
                  }))
                }
              />
              <span className="text-neutral-500">〜</span>
              <input
                type="date"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={filters.established_to ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    established_to: e.target.value || null,
                  }))
                }
              />
              <div className="text-xs text-neutral-500">
                現在: {establishedSummary}
              </div>
            </div>
          </div>

          <hr className="border-neutral-200" />

          {/* キーワード */}
          <div>
            <div className="text-sm font-medium text-neutral-800 mb-1">
              キーワード（カンマ区切り・任意）
            </div>
            <input
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="例: 自社開発, DX, AI, eコマース, サブスク"
              value={filters.keywords.join(", ")}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  keywords: splitCsv(e.target.value),
                }))
              }
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              「採用/募集/求人/recruit」は自動で付与されます。
            </p>
          </div>

          <hr className="border-neutral-200" />

          {/* 業種（モーダル） */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-800">
                  業種（大分類/小分類 複数選択可）
                </div>
                <div className="text-[11px] text-neutral-500">{summaryInd}</div>
              </div>
              <button
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={() => setIndModalOpen(true)}
              >
                業種を選択
              </button>
            </div>

            {(filters.industries_large.length > 0 ||
              filters.industries_small.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {filters.industries_large.map((name) => (
                  <span
                    key={`L:${name}`}
                    className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs"
                  >
                    {name} <em className="not-italic opacity-60">大</em>
                  </span>
                ))}
                {filters.industries_small.map((name) => (
                  <button
                    key={`S:${name}`}
                    className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs"
                    title="クリックで除外"
                    onClick={() =>
                      setFilters((s) => ({
                        ...s,
                        industries_small: s.industries_small.filter(
                          (x) => x !== name
                        ),
                      }))
                    }
                  >
                    {name} <span className="opacity-60">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600">
            {msg}
          </pre>
        )}
      </main>

      {/* 都道府県モーダル */}
      {prefModalOpen && (
        <PrefectureModal
          selected={filters.prefectures}
          onCloseAction={() => setPrefModalOpen(false)}
          onApplyAction={(next) => {
            setFilters((s) => ({ ...s, prefectures: next }));
            setPrefModalOpen(false);
          }}
        />
      )}

      {/* 業種モーダル（このファイル内に定義） */}
      {indModalOpen && (
        <IndustryCategoryModal
          large={filters.industries_large}
          small={filters.industries_small}
          onCloseAction={() => setIndModalOpen(false)}
          onApplyAction={(L, S) => {
            setFilters((s) => ({
              ...s,
              industries_large: L,
              industries_small: S,
            }));
            setIndModalOpen(false);
          }}
        />
      )}
    </>
  );
}

/** =========================
 * 都道府県モーダル
 * ========================= */
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

  React.useEffect(() => setPref(selected ?? []), [selected]);

  const allPrefList = useMemo(() => PREF_GROUPS.flatMap((g) => g.items), []);
  const nationalAll = pref.length === allPrefList.length;

  const filteredGroups = useMemo(() => {
    const q = query.trim();
    if (!q) return PREF_GROUPS;
    return PREF_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((x) => x.includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const toggleNational = (checked: boolean) => {
    if (checked) setPref([...allPrefList]);
    else setPref([]);
  };

  const regionAllChecked = (items: string[]) =>
    items.every((x) => pref.includes(x)) && items.length > 0;

  const toggleRegionAll = (items: string[], checked: boolean) => {
    if (checked) {
      const union = new Set<string>([...pref, ...items]);
      setPref(Array.from(union));
    } else {
      setPref(pref.filter((x) => !items.includes(x)));
    }
  };

  const toggleOne = (name: string, checked: boolean) => {
    setPref((p) =>
      checked ? Array.from(new Set([...p, name])) : p.filter((x) => x !== name)
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[980px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
        {/* Header */}
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
          {/* 全国 すべて選択 */}
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

          {/* 地方グループ */}
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

        {/* Footer */}
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
 * 業種モーダル（このファイル内で定義）
 * ========================= */
function IndustryCategoryModal({
  large,
  small,
  onCloseAction,
  onApplyAction,
}: {
  large: IndustryLarge[];
  small: string[];
  onCloseAction: () => void;
  onApplyAction: (L: IndustryLarge[], S: string[]) => void;
}) {
  const [L, setL] = useState<IndustryLarge[]>(large ?? []);
  const [S, setS] = useState<string[]>(small ?? []);
  const [activeL, setActiveL] = useState<IndustryLarge>(
    (L[0] ?? INDUSTRY_LARGE[0]) as IndustryLarge
  );

  React.useEffect(() => {
    setL(large ?? []);
    setS(small ?? []);
    setActiveL(
      ((large?.[0] as IndustryLarge) ?? INDUSTRY_LARGE[0]) as IndustryLarge
    );
  }, [large, small]);

  const rightGroup: IndustryLarge = activeL;

  const toggleLarge = (lg: IndustryLarge) => {
    const checked = !L.includes(lg);
    const nextL = checked ? [...L, lg] : L.filter((x) => x !== lg);
    setL(nextL);

    const children = INDUSTRY_CATEGORIES[lg] ?? [];
    if (checked) {
      const union = new Set<string>([...S, ...children]);
      setS(Array.from(union));
    } else {
      setS(S.filter((x) => !children.includes(x)));
    }
  };

  const toggleSmall = (sm: string) =>
    setS(S.includes(sm) ? S.filter((x) => x !== sm) : [...S, sm]);

  const allLarge = L.length === INDUSTRY_LARGE.length;
  const toggleAllLarge = (checked: boolean) => {
    if (checked) {
      setL([...INDUSTRY_LARGE]);
      const allSm = (INDUSTRY_LARGE as readonly IndustryLarge[]).flatMap(
        (lg: IndustryLarge) => INDUSTRY_CATEGORIES[lg] || []
      );
      setS(allSm.slice());
    } else {
      setL([]);
      setS([]);
    }
  };

  const activeAllSmall =
    (INDUSTRY_CATEGORIES[rightGroup] || []).every((sm: string) =>
      S.includes(sm)
    ) && (INDUSTRY_CATEGORIES[rightGroup] || []).length > 0;

  const toggleActiveAllSmall = (checked: boolean) => {
    const children = INDUSTRY_CATEGORIES[rightGroup] || [];
    if (checked) {
      const union = new Set<string>([...S, ...children]);
      setS(Array.from(union));
      if (!L.includes(rightGroup)) setL([...L, rightGroup]);
    } else {
      setS(S.filter((x) => !children.includes(x)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[980px] max-w-[96vw] rounded-2xl bg-white shadow-xl border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="font-semibold">業種選択</div>
          <button
            onClick={onCloseAction}
            className="rounded-lg px-2 py-1 border border-neutral-300 hover:bg-neutral-50 text-sm"
          >
            閉じる
          </button>
        </div>

        <div className="grid grid-cols-12 gap-4 p-4">
          {/* 左：大分類 */}
          <div className="col-span-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm inline-flex items-center">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={allLarge}
                  onChange={(e) => toggleAllLarge(e.target.checked)}
                />
                大分類 すべて選択
              </label>
            </div>
            <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-200 max-h-[520px] overflow-auto">
              {(INDUSTRY_LARGE as readonly IndustryLarge[]).map(
                (lg: IndustryLarge) => {
                  const checked = L.includes(lg);
                  const active = activeL === lg;
                  return (
                    <div
                      key={lg}
                      onClick={() => setActiveL(lg)}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                        active ? "bg-neutral-100" : "bg-white"
                      }`}
                    >
                      <div className="text-sm font-medium">{lg}</div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLarge(lg)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {/* 右：小分類 */}
          <div className="col-span-8">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-neutral-800">
                小分類（{rightGroup}）
              </div>
              <label className="text-sm inline-flex items-center">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={activeAllSmall}
                  onChange={(e) => toggleActiveAllSmall(e.target.checked)}
                />
                表示中の小分類をすべて選択/解除
              </label>
            </div>

            <div className="rounded-xl border border-neutral-200 p-3 max-h-[520px] overflow-auto">
              <div className="grid grid-cols-2 gap-2">
                {(INDUSTRY_CATEGORIES[rightGroup] || []).map((sm: string) => (
                  <label key={sm} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={S.includes(sm)}
                      onChange={() => toggleSmall(sm)}
                    />
                    <span className="text-sm">{sm}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200">
          <button
            onClick={() => {
              setL([]);
              setS([]);
            }}
            className="rounded-lg px-3 py-1 border border-neutral-300 text-sm hover:bg-neutral-50"
          >
            クリア
          </button>
          <button
            onClick={() => onApplyAction(L, S)}
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
 * helpers
 * ========================= */
function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function safeJson(res: Response) {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function formatTs(ts: string) {
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Tokyo",
      hour12: false,
    }).format(d);
  } catch {
    return ts;
  }
}

function toIndustryLarge(input: unknown): IndustryLarge[] {
  if (!Array.isArray(input)) return [];
  const allow = new Set<IndustryLarge>(
    INDUSTRY_LARGE as readonly IndustryLarge[]
  );
  return input.filter(
    (x): x is IndustryLarge =>
      typeof x === "string" && allow.has(x as IndustryLarge)
  );
}

function parseYenInput(v: string): number | null {
  if (!v) return null;
  const s = v.replace(/\s/g, "");
  const m = /^([0-9.,]+)(万|億)?$/u.exec(s);
  if (m) {
    const num = Number(m[1].replace(/[,，]/g, ""));
    if (!Number.isFinite(num)) return null;
    if (m[2] === "万") return Math.round(num * 10_000);
    if (m[2] === "億") return Math.round(num * 100_000_000);
    return Math.round(num);
  }
  // そのまま数値化トライ
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function formatYen(n: number) {
  if (n >= 100_000_000 && n % 100_000_000 === 0)
    return `${n / 100_000_000}億円`;
  if (n >= 10_000 && n % 10_000 === 0) return `${n / 10_000}万円`;
  return `${n.toLocaleString()}円`;
}
