// web/src/app/form-outreach/settings/filters/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

/** ====== 型 ====== */
type Filters = {
  prefectures: string[];
  employee_size_ranges: string[];
  keywords: string[];
  industries: string[]; // 業種（複数選択）
  updated_at?: string | null;
};

/** ====== 定数 ====== */
const SIZE_OPTS = ["1-9", "10-49", "50-249", "250+"];

// 47都道府県（グループ）
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

// 日本標準産業分類を意識して実務向けに集約・拡充
const INDUSTRY_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "農林水産",
    items: ["農業", "畜産", "園芸", "林業", "水産業", "水産加工"],
  },
  { label: "鉱業・採石", items: ["鉱業", "採石業", "砂利・土石採取"] },

  {
    label: "建設",
    items: [
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
  },

  {
    label: "製造（食品・生活）",
    items: [
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
  },

  {
    label: "製造（素材・化学・資源）",
    items: [
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
  },

  {
    label: "製造（機械・電機・輸送）",
    items: [
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
  },

  {
    label: "エネルギー・公益",
    items: [
      "電力",
      "ガス",
      "熱供給",
      "水道",
      "再生可能エネルギー",
      "エネルギー商社",
      "送配電",
      "プラントエンジ",
    ],
  },

  {
    label: "情報通信・メディア",
    items: [
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
  },

  {
    label: "運輸・物流・郵便",
    items: [
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
  },

  {
    label: "卸売",
    items: [
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
  },

  {
    label: "小売",
    items: [
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
  },

  {
    label: "金融・保険・不動産",
    items: [
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
  },

  {
    label: "専門サービス・士業",
    items: [
      "法律（弁護士）",
      "会計（公認会計士/税理士）",
      "社労士",
      "司法書士・行政書士",
      "コンサルティング（戦略/IT/業務）",
      "監査・アドバイザリー",
      "調査・リサーチ",
      "翻訳・通訳",
      "デザイン・クリエイティブ",
      "広告代理店",
      "PR・ブランディング",
      "イベント・展示会",
    ],
  },

  {
    label: "宿泊・飲食",
    items: [
      "ホテル・旅館",
      "民泊・簡易宿所",
      "飲食店（レストラン・カフェ・バー）",
      "フードデリバリー/ケータリング",
    ],
  },

  {
    label: "生活関連・娯楽・スポーツ",
    items: [
      "理美容・エステ",
      "クリーニング",
      "旅行業",
      "冠婚葬祭",
      "スポーツ・フィットネス",
      "娯楽・アミューズメント",
      "テーマパーク",
      "ペット関連",
    ],
  },

  {
    label: "教育・学習支援",
    items: [
      "学校教育",
      "幼稚園・保育園",
      "学習塾・予備校",
      "語学・カルチャー",
      "企業研修・人材育成",
      "オンライン教育",
    ],
  },

  {
    label: "医療・福祉",
    items: [
      "病院・クリニック",
      "歯科",
      "調剤薬局",
      "介護・福祉施設",
      "訪問看護・介護",
      "医療系サービス",
      "保育",
    ],
  },

  {
    label: "公務・団体・NPO",
    items: [
      "官公庁・自治体",
      "独立行政法人",
      "公社・公団",
      "業界団体・組合",
      "国際機関",
      "NPO/NGO",
      "公益法人",
    ],
  },

  {
    label: "環境・安全・インフラ保全",
    items: [
      "廃棄物処理・リサイクル",
      "環境コンサル/計測",
      "ビルメンテナンス",
      "清掃・警備",
      "設備保全",
      "インフラ保全",
    ],
  },

  {
    label: "人材・BPO",
    items: [
      "人材紹介",
      "人材派遣",
      "求人媒体・HRテック",
      "BPO/アウトソーシング",
      "コールセンター",
      "SES",
    ],
  },

  {
    label: "レンタル・リース・シェア",
    items: [
      "レンタル（機器・車両・スペース）",
      "カーシェア/モビリティ",
      "シェアオフィス/スペース",
      "レンタルスペース",
    ],
  },

  {
    label: "その他サービス",
    items: [
      "写真・映像",
      "印刷サービス",
      "修理・メンテナンス",
      "配管・水回り",
      "ハウスクリーニング",
      "その他サービス",
    ],
  },
];

/** ====== 画面本体 ====== */
export default function FiltersPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    prefectures: [],
    employee_size_ranges: [],
    keywords: [],
    industries: [],
    updated_at: null,
  });

  // 都道府県モーダル
  const [prefModalOpen, setPrefModalOpen] = useState(false);
  const [prefQuery, setPrefQuery] = useState("");

  // 業種モーダル（左右2ペイン）
  const [indModalOpen, setIndModalOpen] = useState(false);
  const [industryQuery, setIndustryQuery] = useState("");
  const [activeIndGroup, setActiveIndGroup] = useState<string>(
    INDUSTRY_GROUPS[0]?.label || ""
  );

  useEffect(() => {
    (async () => {
      try {
        const me = await fetch("/api/me/tenant", { cache: "no-store" }).then(
          (r) => r.json()
        );
        const tId = me?.profile?.tenant_id ?? null;
        setTenantId(tId);

        const j = await fetch("/api/form-outreach/settings/filters", {
          cache: "no-store",
          headers: tId ? { "x-tenant-id": tId } : undefined,
        }).then((r) => r.json());

        const incoming = j?.filters ?? {};
        setFilters({
          prefectures: incoming.prefectures ?? [],
          employee_size_ranges: incoming.employee_size_ranges ?? [],
          keywords: incoming.keywords ?? [],
          industries: incoming.industries ?? incoming.job_titles ?? [],
          updated_at: incoming.updated_at ?? null,
        });
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
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "save failed");
      setFilters((f) => ({ ...f, updated_at: j?.filters?.updated_at ?? null }));
      setMsg("保存しました。");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  /** ====== サマリ ====== */
  const summaryPref = useMemo(() => {
    const n = filters.prefectures.length;
    if (n === 0) return "（全国）";
    return n <= 6 ? filters.prefectures.join(" / ") : `${n} 都道府県を選択中`;
  }, [filters.prefectures]);

  const summaryInd = useMemo(() => {
    const n = filters.industries.length;
    if (n === 0) return "（未選択）";
    return n <= 6 ? filters.industries.join(" / ") : `${n} 業種を選択中`;
  }, [filters.industries]);

  /** ====== 検索適用（都道府県） ====== */
  const filteredPrefGroups = useMemo(() => {
    const q = prefQuery.trim().toLowerCase();
    if (!q) return PREF_GROUPS;
    return PREF_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((x) => x.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [prefQuery]);

  /** ====== 検索適用（業種：右ペイン表示用） ====== */
  const activeGroupItems = useMemo(() => {
    const group = INDUSTRY_GROUPS.find((g) => g.label === activeIndGroup);
    if (!group) return [];
    const q = industryQuery.trim().toLowerCase();
    if (!q) return group.items;
    return group.items.filter((x) => x.toLowerCase().includes(q));
  }, [activeIndGroup, industryQuery]);

  /** ====== 選択ユーティリティ ====== */
  const allPrefectures = useMemo(() => PREF_GROUPS.flatMap((g) => g.items), []);
  const allIndustries = useMemo(
    () => INDUSTRY_GROUPS.flatMap((g) => g.items),
    []
  );

  /** ====== UI ====== */
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
          {/* 都道府県（モーダル起動型） */}
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

            {/* 選択中チップ（削除可） */}
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

          {/* 業種（転職サイト風：モーダル起動型） */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-800">
                  業種（複数選択可）
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

            {/* 選択中チップ（削除可） */}
            {filters.industries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {filters.industries.map((name) => (
                  <button
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs"
                    title="クリックで除外"
                    onClick={() =>
                      setFilters((s) => ({
                        ...s,
                        industries: s.industries.filter((x) => x !== name),
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

      {/* ====== 都道府県モーダル（アクション構成を業種と統一） ====== */}
      {prefModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setPrefModalOpen(false)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー：全選択 / 全クリア / 閉じる / 適用 */}
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold text-neutral-800">
                都道府県を選択
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                  onClick={() =>
                    setFilters((s) => ({
                      ...s,
                      prefectures: Array.from(new Set(allPrefectures)),
                    }))
                  }
                >
                  全選択
                </button>
                <button
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                  onClick={() => setFilters((s) => ({ ...s, prefectures: [] }))}
                >
                  全クリア
                </button>
                <button
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                  onClick={() => setPrefModalOpen(false)}
                >
                  閉じる
                </button>
                <button
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                  onClick={() => setPrefModalOpen(false)}
                >
                  適用
                </button>
              </div>
            </div>

            {/* 検索 */}
            <div className="mb-3">
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="都道府県を検索…（例: 大阪、東）"
                value={prefQuery}
                onChange={(e) => setPrefQuery(e.target.value)}
              />
            </div>

            {/* 本体 */}
            <div className="max-h-[60vh] overflow-auto space-y-3 pr-1">
              {filteredPrefGroups.map((g) => (
                <div
                  key={g.label}
                  className="rounded-xl border border-neutral-200 p-3"
                >
                  <div className="text-xs font-semibold text-neutral-700 mb-2">
                    {g.label}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2 text-sm">
                    {g.items.map((name) => {
                      const checked = filters.prefectures.includes(name);
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
                            onChange={(e) =>
                              setFilters((s) => ({
                                ...s,
                                prefectures: e.target.checked
                                  ? Array.from(
                                      new Set([...s.prefectures, name])
                                    )
                                  : s.prefectures.filter((x) => x !== name),
                              }))
                            }
                          />
                          {name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredPrefGroups.length === 0 && (
                <div className="text-xs text-neutral-400">
                  該当する都道府県がありません
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== 業種モーダル（左右2ペイン・バッジ廃止） ====== */}
      {indModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setIndModalOpen(false)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl border border-neutral-200 bg-white p-0 shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー：全選択 / 全クリア / 閉じる / 適用 */}
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
              <div className="text-base font-semibold text-neutral-800">
                業種を選択
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                  onClick={() =>
                    setFilters((s) => ({
                      ...s,
                      industries: Array.from(new Set(allIndustries)),
                    }))
                  }
                >
                  全選択
                </button>
                <button
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                  onClick={() => setFilters((s) => ({ ...s, industries: [] }))}
                >
                  全クリア
                </button>
                <button
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                  onClick={() => setIndModalOpen(false)}
                >
                  閉じる
                </button>
                <button
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                  onClick={() => setIndModalOpen(false)}
                >
                  適用
                </button>
              </div>
            </div>

            {/* 検索 */}
            <div className="px-4 py-3 border-b border-neutral-100">
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="業種を検索…（例: 製造、広告、物流、SaaS）"
                value={industryQuery}
                onChange={(e) => setIndustryQuery(e.target.value)}
              />
            </div>

            {/* 本体：左右2ペイン */}
            <div className="flex h-[64vh]">
              {/* 左ペイン：カテゴリ */}
              <aside className="w-64 shrink-0 border-r border-neutral-200 overflow-auto">
                {INDUSTRY_GROUPS.map((g) => {
                  const count = g.items.filter((x) =>
                    filters.industries.includes(x)
                  ).length;
                  const active = g.label === activeIndGroup;
                  return (
                    <button
                      key={g.label}
                      onClick={() => setActiveIndGroup(g.label)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm border-b border-neutral-100 ${
                        active
                          ? "bg-neutral-50 font-semibold"
                          : "hover:bg-neutral-50"
                      }`}
                    >
                      <span className="text-left">{g.label}</span>
                      <span className="text-[11px] text-neutral-500">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </aside>

              {/* 右ペイン：詳細（アクティブカテゴリ） */}
              <section className="flex-1 overflow-auto p-4">
                {/* 選択中チップ */}
                {filters.industries.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {filters.industries.map((name) => (
                      <button
                        key={name}
                        className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs"
                        title="クリックで除外"
                        onClick={() =>
                          setFilters((s) => ({
                            ...s,
                            industries: s.industries.filter((x) => x !== name),
                          }))
                        }
                      >
                        {name} <span className="opacity-60">×</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* グループ操作（カテゴリ全選択/クリア） */}
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-neutral-800">
                    {activeIndGroup}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                      onClick={() => {
                        const group = INDUSTRY_GROUPS.find(
                          (g) => g.label === activeIndGroup
                        );
                        if (!group) return;
                        setFilters((s) => ({
                          ...s,
                          industries: Array.from(
                            new Set([...s.industries, ...group.items])
                          ),
                        }));
                      }}
                    >
                      このカテゴリを全選択
                    </button>
                    <button
                      className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                      onClick={() => {
                        const group = INDUSTRY_GROUPS.find(
                          (g) => g.label === activeIndGroup
                        );
                        if (!group) return;
                        setFilters((s) => ({
                          ...s,
                          industries: s.industries.filter(
                            (x) => !group.items.includes(x)
                          ),
                        }));
                      }}
                    >
                      クリア
                    </button>
                  </div>
                </div>

                {/* チェック群（検索適用済） */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {activeGroupItems.map((name) => {
                    const checked = filters.industries.includes(name);
                    return (
                      <label
                        key={name}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          checked
                            ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                            : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setFilters((s) => ({
                              ...s,
                              industries: e.target.checked
                                ? Array.from(new Set([...s.industries, name]))
                                : s.industries.filter((x) => x !== name),
                            }))
                          }
                        />
                        {name}
                      </label>
                    );
                  })}
                  {activeGroupItems.length === 0 && (
                    <div className="text-xs text-neutral-400">
                      該当する項目がありません
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** ====== helpers ====== */
function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
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
