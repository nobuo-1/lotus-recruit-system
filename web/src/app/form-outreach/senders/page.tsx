// web/src/app/form-outreach/senders/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { PageHero, PageMain, SectionTitle, SurfaceCard } from "@/components/PageChrome";

type Sender = {
  id?: string;
  sender_type?: "corporate" | "individual";
  sender_company?: string | null; // 会社名（{{sender_company}})
  sender_company_kana?: string | null;
  sender_department?: string | null;
  sender_position?: string | null;
  from_header_name?: string | null; // From: に表示する名前
  from_name: string; // 担当者名など（{{sender_name}})
  sender_name_kana?: string | null;
  from_email: string;
  reply_to?: string | null;
  phone?: string | null;
  website?: string | null;
  signature?: string | null;
  is_default: boolean;

  // ★ フォーム営業用 送信者情報
  postal_code?: string | null;
  sender_prefecture?: string | null;
  sender_address?: string | null;
  sender_last_name?: string | null;
  sender_first_name?: string | null;
  sender_last_name_kana?: string | null;
  sender_first_name_kana?: string | null;
};

const defaultSender: Sender = {
  sender_type: "corporate",
  sender_company: "",
  sender_company_kana: "",
  sender_department: "",
  sender_position: "",
  from_header_name: "",
  from_name: "",
  sender_name_kana: "",
  from_email: "",
  reply_to: "",
  phone: "",
  website: "",
  signature: "",
  is_default: true,
  postal_code: "",
  sender_prefecture: "",
  sender_address: "",
  sender_last_name: "",
  sender_first_name: "",
  sender_last_name_kana: "",
  sender_first_name_kana: "",
};

export default function SenderSettings() {
  const [s, setS] = useState<Sender>(defaultSender);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const res = await fetch("/api/form-outreach/senders", {
      cache: "no-store",
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "fetch failed");
    if (j?.needs_migration) {
      setMsg("DBカラム追加が未適用のため、新しい送信元項目はまだ保存できません。");
    }
    setS(j.row ?? defaultSender);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const res = await fetch("/api/form-outreach/senders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, is_default: true }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error || "save failed");
    if (j?.needs_migration) {
      return setMsg(
        "基本項目は保存しました。新しい送信元項目を保存するにはDBマイグレーションを適用してください。"
      );
    }
    setMsg("保存しました");
  };

  return (
    <PageMain className="space-y-6">
      <PageHero
        eyebrow="Senders"
        title="送信元設定"
        description="フォーム営業で使う差出人情報をひとつの画面で更新します。メール送信時の表示名、返信先、署名、フォーム入力用の住所や氏名までここで揃えます。"
        accent="rose"
      />

      <SurfaceCard className="space-y-6">
        <SectionTitle
          title="送信者プロフィール"
          description="このテナントでは既定の送信元 1 件を編集します。保存するとテンプレート差し込み値にも反映されます。"
          action={
            <div className="flex items-center gap-3">
              {msg && <span className="text-xs text-neutral-500">{msg}</span>}
              <button
                onClick={save}
                className="rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
                保存
              </button>
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] p-5">
              <div className="mb-4 text-sm font-semibold text-neutral-900">
                メール送信時に使う項目
              </div>
              <div className="space-y-3">
                <Field label="送信者区分">
                  <div className="inline-flex rounded-2xl border border-neutral-200 bg-white p-1">
                    {[
                      ["corporate", "法人"],
                      ["individual", "個人"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setS({
                            ...s,
                            sender_type: value as Sender["sender_type"],
                          })
                        }
                        className={`rounded-xl px-4 py-2 text-sm ${
                          s.sender_type === value
                            ? "bg-neutral-950 text-white"
                            : "text-neutral-600 hover:bg-neutral-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>

                {s.sender_type !== "individual" && (
                  <>
                    <Field label="法人名（{{sender_company}} 用）">
                      <input
                        className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                        value={s.sender_company ?? ""}
                        onChange={(e) =>
                          setS({ ...s, sender_company: e.target.value || "" })
                        }
                      />
                    </Field>

                    <Field label="法人名ふりがな（{{sender_company_kana}} 用）">
                      <input
                        className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                        value={s.sender_company_kana ?? ""}
                        onChange={(e) =>
                          setS({
                            ...s,
                            sender_company_kana: e.target.value || "",
                          })
                        }
                      />
                    </Field>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="部署名（{{sender_department}} 用）">
                        <input
                          className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                          placeholder="例）営業部"
                          value={s.sender_department ?? ""}
                          onChange={(e) =>
                            setS({
                              ...s,
                              sender_department: e.target.value || "",
                            })
                          }
                        />
                      </Field>
                      <Field label="役職（{{sender_position}} 用）">
                        <input
                          className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                          placeholder="例）マネージャー"
                          value={s.sender_position ?? ""}
                          onChange={(e) =>
                            setS({
                              ...s,
                              sender_position: e.target.value || "",
                            })
                          }
                        />
                      </Field>
                    </div>
                  </>
                )}

                <Field label="From 表示名（メールの差出人に表示）">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    placeholder="例）LOTUS 採用DXチーム"
                    value={s.from_header_name ?? ""}
                    onChange={(e) =>
                      setS({ ...s, from_header_name: e.target.value || "" })
                    }
                  />
                  <p className="mt-1 text-[11px] text-neutral-500">
                    空の場合は「会社名 → 送信者名 → Lotus
                    System」の優先順位で使用されます。
                  </p>
                </Field>

                <Field label="送信者名（{{sender_name}} 用 / 個人名・担当者名）">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    value={s.from_name ?? ""}
                    onChange={(e) => setS({ ...s, from_name: e.target.value })}
                  />
                </Field>

                <Field label="送信者名ふりがな（{{sender_name_kana}} 用）">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    value={s.sender_name_kana ?? ""}
                    onChange={(e) =>
                      setS({ ...s, sender_name_kana: e.target.value })
                    }
                  />
                </Field>

                <Field label="送信メール（from_email）">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    value={s.from_email ?? ""}
                    onChange={(e) => setS({ ...s, from_email: e.target.value })}
                  />
                </Field>

                <Field label="Reply-To">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    value={s.reply_to ?? ""}
                    onChange={(e) => setS({ ...s, reply_to: e.target.value })}
                  />
                </Field>

                <Field label="電話番号">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    value={s.phone ?? ""}
                    onChange={(e) => setS({ ...s, phone: e.target.value })}
                  />
                </Field>

                <Field label="WebサイトURL">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    value={s.website ?? ""}
                    onChange={(e) => setS({ ...s, website: e.target.value })}
                  />
                </Field>

                <Field label="署名（{{signature}} 用テキスト）">
                  <textarea
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    rows={6}
                    value={s.signature ?? ""}
                    onChange={(e) => setS({ ...s, signature: e.target.value })}
                  />
                  <p className="mt-1 text-[11px] text-neutral-500">
                    テンプレート本文内で <code>{"{{signature}}"}</code>{" "}
                    を書いた場所にだけ、この署名が展開されます。
                  </p>
                </Field>
              </div>
            </div>

            <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,252,0.92))] p-5">
              <div className="mb-4 text-sm font-semibold text-neutral-900">
                フォーム入力用の送信者情報
              </div>
              <div className="space-y-3">
                <Field label="郵便番号">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    placeholder="例）123-4567"
                    value={s.postal_code ?? ""}
                    onChange={(e) => setS({ ...s, postal_code: e.target.value })}
                  />
                </Field>

                <Field label="都道府県">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    placeholder="例）大阪府"
                    value={s.sender_prefecture ?? ""}
                    onChange={(e) =>
                      setS({ ...s, sender_prefecture: e.target.value })
                    }
                  />
                </Field>

                <Field label="住所（市区町村・番地・建物名など）">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                    value={s.sender_address ?? ""}
                    onChange={(e) => setS({ ...s, sender_address: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="姓（フォーム用）">
                    <input
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                      value={s.sender_last_name ?? ""}
                      onChange={(e) =>
                        setS({ ...s, sender_last_name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="名（フォーム用）">
                    <input
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                      value={s.sender_first_name ?? ""}
                      onChange={(e) =>
                        setS({ ...s, sender_first_name: e.target.value })
                      }
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="姓ふりがな（フォーム用）">
                    <input
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                      value={s.sender_last_name_kana ?? ""}
                      onChange={(e) =>
                        setS({ ...s, sender_last_name_kana: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="名ふりがな（フォーム用）">
                    <input
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                      value={s.sender_first_name_kana ?? ""}
                      onChange={(e) =>
                        setS({ ...s, sender_first_name_kana: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-neutral-200 bg-neutral-50/70 p-5">
            <div className="text-sm font-semibold text-neutral-900">
              反映される用途
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-neutral-600">
              <p>メール送信時の差出人表示、返信先、署名に使われます。</p>
              <p>フォーム営業では法人/個人、法人名、ふりがな、部署名、役職、住所、姓・名、電話番号などの自動入力にも使われます。</p>
              <p>テンプレートの差し込み変数と整合するよう、保存前に不足項目を確認してください。</p>
            </div>
          </div>
        </div>
      </SurfaceCard>
    </PageMain>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs text-neutral-600 mb-1">{label}</div>
      {children}
    </div>
  );
}
