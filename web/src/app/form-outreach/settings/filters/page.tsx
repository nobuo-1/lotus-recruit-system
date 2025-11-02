// web/src/app/form-outreach/settings/filters/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

/** ====== 型 ====== */
type Filters = {
  prefectures: string[];
  employee_size_ranges: string[];
  keywords: string[];
  industries: string[]; // ← 職種ではなく業種に変更
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

// 日本標準産業分類をベースに網羅的に（粒度を実務で使いやすい単位へ調整）
const INDUSTRY_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "農林水産",
    items: ["農業", "林業", "水産業"],
  },
  {
    label: "鉱業・採石・砂利採取",
    items: ["鉱業", "採石業", "砂利・土石採取"],
  },
  {
    label: "建設",
    items: [
      "総合工事",
      "職別工事（設備・内装・仕上げ等）",
      "設備工事（電気・管・空調）",
      "土木工事",
      "建築設計/測量/地質調査",
    ],
  },
  {
    label: "製造（食品・生活）",
    items: [
      "食料品製造",
      "飲料・たばこ・飼料",
      "繊維工業",
      "衣服・その他繊維製品",
      "木材・木製品",
      "家具・装備品",
      "紙・パルプ",
      "印刷・同関連業",
      "ゴム製品",
      "なめし革・同製品",
    ],
  },
  {
    label: "製造（素材・化学）",
    items: [
      "化学工業",
      "医薬品",
      "石油製品・石炭製品",
      "プラスチック製品",
      "窯業・土石製品",
      "鉄鋼",
      "非鉄金属",
      "金属製品",
    ],
  },
  {
    label: "製造（機械・電機・輸送）",
    items: [
      "一般機械器具",
      "電気機械器具",
      "電子部品・デバイス",
      "情報通信機器",
      "輸送用機器（自動車・航空機等）",
      "精密機器",
      "その他製造業",
    ],
  },
  {
    label: "電気・ガス・熱供給・水道",
    items: ["電気業", "ガス業", "熱供給業", "水道業"],
  },
  {
    label: "情報通信",
    items: [
      "ソフトウェア",
      "受託開発/SI",
      "インターネットサービス/プラットフォーム",
      "SaaS",
      "通信（キャリア/ISP）",
      "放送",
      "コンテンツ制作/配信",
      "データセンター/クラウド",
    ],
  },
  {
    label: "運輸・郵便",
    items: [
      "鉄道",
      "道路旅客運送（バス・タクシー）",
      "道路貨物運送（トラック）",
      "倉庫・運輸関連",
      "海運",
      "空運",
      "郵便",
    ],
  },
  {
    label: "卸売",
    items: [
      "各種商品卸売",
      "機械器具卸売",
      "建材・金物・化学品卸",
      "食品・飲料卸",
      "繊維・衣服卸",
      "自動車・部品卸",
      "その他卸売",
    ],
  },
  {
    label: "小売",
    items: [
      "百貨店・総合小売",
      "スーパーマーケット",
      "コンビニ",
      "ドラッグストア",
      "専門小売（家電・家具・衣料・スポーツ等）",
      "EC/ネット通販",
      "自動車小売",
      "ホームセンター",
      "飲料小売",
    ],
  },
  {
    label: "金融・保険",
    items: [
      "銀行",
      "信金・信組",
      "証券",
      "投資・VC/PE",
      "リース・クレジット",
      "保険（生保・損保・代理店）",
      "フィンテック",
    ],
  },
  {
    label: "不動産・物品賃貸",
    items: [
      "不動産開発",
      "不動産仲介",
      "ビルメンテナンス/管理",
      "駐車場",
      "レンタル・リース（機器・自動車等）",
      "シェアオフィス/スペース",
    ],
  },
  {
    label: "学術研究・専門技術サービス",
    items: [
      "学術研究",
      "法務（弁護士）",
      "会計（税理士/公認会計士）",
      "社労士",
      "コンサルティング",
      "デザイン/クリエイティブ",
      "広告代理店",
      "マーケティング支援",
      "調査/リサーチ",
    ],
  },
  {
    label: "宿泊・飲食サービス",
    items: [
      "ホテル・旅館",
      "民泊・簡易宿所",
      "飲食店（レストラン・カフェ・バー等）",
      "フードデリバリー/ケータリング",
    ],
  },
  {
    label: "生活関連サービス・娯楽",
    items: [
      "理美容・エステ",
      "クリーニング",
      "旅行業",
      "冠婚葬祭",
      "スポーツ・フィットネス",
      "娯楽・アミューズメント",
    ],
  },
  {
    label: "教育・学習支援",
    items: [
      "学校教育",
      "学習塾・予備校",
      "語学・カルチャー",
      "企業研修/人材育成",
      "オンライン教育",
    ],
  },
  {
    label: "医療・福祉",
    items: [
      "病院・クリニック",
      "調剤薬局",
      "歯科",
      "介護・福祉施設",
      "訪問看護/介護",
      "保育",
    ],
  },
  {
    label: "公務・団体・NPO",
    items: ["官公庁・自治体", "独立行政法人", "業界団体・組合", "NPO/NGO"],
  },
  {
    label: "廃棄物・環境・エネルギー",
    items: [
      "廃棄物処理・リサイクル",
      "再生可能エネルギー",
      "環境コンサル/計測",
    ],
  },
  {
    label: "人材・BPO・その他サービス",
    items: [
      "人材紹介",
      "人材派遣",
      "BPO/アウトソーシング",
      "コールセンター",
      "清掃・警備",
      "レンタルスペース/イベント運営",
      "その他サービス",
    ],
  },
];

// よく使うクイック選択
const QUICK_INDUSTRIES = [
  "SaaS",
  "受託開発/SI",
  "EC/ネット通販",
  "不動産仲介",
  "建築設計/測量/地質調査",
  "病院・クリニック",
  "介護・福祉施設",
  "ホテル・旅館",
  "飲食店（レストラン・カフェ・バー等）",
  "人材紹介",
  "人材派遣",
  "広告代理店",
  "マーケティング支援",
  "製造（一般機械器具）",
  "倉庫・運輸関連",
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

  // 検索ボックス
  const [prefQuery, setPrefQuery] = useState("");
  const [industryQuery, setIndustryQuery] = useState("");

  // 折りたたみ（業種）
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(INDUSTRY_GROUPS.slice(0, 4).map((g) => g.label)) // 初期は上位4グループを展開
  );

  useEffect(() => {
    (async () => {
      try {
        const me = await fetch("/api/me/tenant", { cache: "no-store" }).then(
          (r) => r.json()
        );
        setTenantId(me?.profile?.tenant_id ?? null);

        const j = await fetch("/api/form-outreach/settings/filters", {
          cache: "no-store",
        }).then((r) => r.json());

        // 互換: industries がまだ無いAPIでも job_titles があれば取り込む
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters }), // industries を保存
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

  /** ====== サマリ表示 ====== */
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

  /** ====== 検索 ====== */
  const filteredPrefGroups = useMemo(() => {
    const q = prefQuery.trim();
    if (!q) return PREF_GROUPS;
    const f = q.toLowerCase();
    return PREF_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((x) => x.toLowerCase().includes(f)),
    })).filter((g) => g.items.length > 0);
  }, [prefQuery]);

  const filteredIndustryGroups = useMemo(() => {
    const q = industryQuery.trim().toLowerCase();
    if (!q) return INDUSTRY_GROUPS;
    return INDUSTRY_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((x) => x.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [industryQuery]);

  /** ====== 都道府県 一括 ====== */
  const selectAllPref = () => {
    const all = PREF_GROUPS.flatMap((g) => g.items);
    setFilters((s) => ({ ...s, prefectures: Array.from(new Set(all)) }));
  };
  const clearPref = () => setFilters((s) => ({ ...s, prefectures: [] }));

  /** ====== 業種：グループ操作 ====== */
  const toggleGroupOpen = (label: string) =>
    setOpenGroups((prev) => {
      const n = new Set(prev);
      n.has(label) ? n.delete(label) : n.add(label);
      return n;
    });

  const countSelectedInGroup = (items: string[]) =>
    items.filter((x) => filters.industries.includes(x)).length;

  const selectGroup = (items: string[]) =>
    setFilters((s) => ({
      ...s,
      industries: Array.from(new Set([...s.industries, ...items])),
    }));

  const clearGroup = (items: string[]) =>
    setFilters((s) => ({
      ...s,
      industries: s.industries.filter((x) => !items.includes(x)),
    }));

  /** ====== クイック選択 ====== */
  const toggleQuick = (name: string) =>
    setFilters((s) => ({
      ...s,
      industries: s.industries.includes(name)
        ? s.industries.filter((x) => x !== name)
        : [...s.industries, name],
    }));

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
          {/* 都道府県 */}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAllPref}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs hover:bg-neutral-50"
                >
                  全選択
                </button>
                <button
                  onClick={clearPref}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs hover:bg-neutral-50"
                >
                  クリア
                </button>
              </div>
            </div>

            <div className="mb-2">
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="都道府県を検索…（例: 大阪、東）"
                value={prefQuery}
                onChange={(e) => setPrefQuery(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredPrefGroups.map((g) => (
                <div
                  key={g.label}
                  className="rounded-xl border border-neutral-200 p-3"
                >
                  <div className="text-xs font-semibold text-neutral-700 mb-2">
                    {g.label}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    {g.items.map((name) => {
                      const checked = filters.prefectures.includes(name);
                      return (
                        <label key={name} className="flex items-center gap-2">
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
                    {g.items.length === 0 && (
                      <div className="text-xs text-neutral-400 col-span-2">
                        該当なし
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
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

          {/* 業種（選択式） */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-800">
                  業種（複数選択可）
                </div>
                <div className="text-[11px] text-neutral-500">{summaryInd}</div>
              </div>
              <div className="flex items-center gap-2">
                {/* 選択中バッジ（削除可能） */}
                {filters.industries.length > 0 && (
                  <div className="hidden md:flex flex-wrap gap-2 max-w-[520px] justify-end">
                    {filters.industries.slice(0, 6).map((name) => (
                      <button
                        key={name}
                        className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs"
                        onClick={() =>
                          setFilters((s) => ({
                            ...s,
                            industries: s.industries.filter((x) => x !== name),
                          }))
                        }
                        title="クリックで削除"
                      >
                        {name} <span className="opacity-60">×</span>
                      </button>
                    ))}
                    {filters.industries.length > 6 && (
                      <span className="text-xs text-neutral-500">
                        +{filters.industries.length - 6}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* クイック選択 */}
            <div className="mb-3 flex flex-wrap gap-2">
              {QUICK_INDUSTRIES.map((q) => {
                const on = filters.industries.includes(q);
                return (
                  <button
                    key={q}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      on
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-neutral-300 hover:bg-neutral-50 text-neutral-700"
                    }`}
                    onClick={() => toggleQuick(q)}
                  >
                    {q}
                  </button>
                );
              })}
            </div>

            {/* 検索 */}
            <div className="mb-2">
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="業種を検索…（例: 製造、広告、物流、SaaS）"
                value={industryQuery}
                onChange={(e) => setIndustryQuery(e.target.value)}
              />
            </div>

            {/* グループ（折りたたみ可能） */}
            <div className="space-y-3">
              {filteredIndustryGroups.map((g) => {
                const opened = openGroups.has(g.label);
                const selectedCount = countSelectedInGroup(g.items);
                return (
                  <div
                    key={g.label}
                    className="rounded-xl border border-neutral-200"
                  >
                    <div
                      className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
                      onClick={() => toggleGroupOpen(g.label)}
                    >
                      <div className="text-sm font-semibold text-neutral-800">
                        {g.label}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-neutral-500">
                          選択 {selectedCount} / {g.items.length}
                        </span>
                        <button
                          className="rounded border border-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectGroup(g.items);
                          }}
                        >
                          全選択
                        </button>
                        <button
                          className="rounded border border-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearGroup(g.items);
                          }}
                        >
                          クリア
                        </button>
                        <span className="text-neutral-400">
                          {opened ? "▾" : "▸"}
                        </span>
                      </div>
                    </div>

                    {opened && (
                      <div className="px-3 pb-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {g.items.map((name) => {
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
                                        ? Array.from(
                                            new Set([...s.industries, name])
                                          )
                                        : s.industries.filter(
                                            (x) => x !== name
                                          ),
                                    }))
                                  }
                                />
                                {name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredIndustryGroups.length === 0 && (
                <div className="text-xs text-neutral-400">
                  該当する業種がありません
                </div>
              )}
            </div>
          </div>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600">
            {msg}
          </pre>
        )}
      </main>
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
