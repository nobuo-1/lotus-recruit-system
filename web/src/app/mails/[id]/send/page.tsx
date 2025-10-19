"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import WheelDatePicker from "@/components/WheelDatePicker";
import WheelTimePicker from "@/components/WheelTimePicker";
import { PREFECTURES } from "@/constants/prefectures";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import { toastSuccess, toastError } from "@/components/AppToast";

type RecipientColumnKey =
  | "name"
  | "company_name"
  | "job_categories"
  | "gender"
  | "age"
  | "created_at"
  | "email"
  | "region"
  | "phone";

const DEFAULT_VISIBLE: RecipientColumnKey[] = [
  "name",
  "company_name",
  "job_categories",
  "email",
  "region",
  "created_at",
];

type Recipient = {
  id: string;
  name: string | null;
  company_name?: string | null;
  email: string | null;
  gender: "male" | "female" | null;
  region: string | null;
  birthday: string | null;
  job_category_large: string | null;
  job_category_small: string | null;
  job_categories?: Array<string | { large?: unknown; small?: unknown }> | null;
  is_active: boolean | null;
};

function ageFromBirthday(iso?: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = +m[1],
    mm = +m[2] - 1,
    d = +m[3];
  const b = new Date(y, mm, d);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const md = now.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
const pad = (n: number) => String(n).padStart(2, "0");
const localDateISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const normalizeJobs = (r: Recipient): string[] => {
  const L = (r.job_category_large ?? "").toString().trim();
  const S = (r.job_category_small ?? "").toString().trim();
  const one =
    L || S ? [`${L}${L && S ? "（" : ""}${S}${L && S ? "）" : ""}`] : [];

  const raw = r.job_categories;
  if (!Array.isArray(raw) || raw.length === 0) return one;

  const toS = (x: unknown): string => {
    if (typeof x === "string") {
      const s = x.trim();
      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          const j = JSON.parse(s);
          if (Array.isArray(j)) return j.map(toS).filter(Boolean).join(" / ");
          if (j && typeof j === "object") {
            const ll = String((j as any).large ?? "").trim();
            const ss = String((j as any).small ?? "").trim();
            return ll && ss ? `${ll}（${ss}）` : ll || ss || "";
          }
        } catch {
          /* as plain string */
        }
      }
      return s;
    }
    if (x && typeof x === "object") {
      const ll = String((x as any).large ?? "").trim();
      const ss = String((x as any).small ?? "").trim();
      return ll && ss ? `${ll}（${ss}）` : ll || ss || "";
    }
    return "";
  };

  return raw.map(toS).filter(Boolean);
};

export default function MailSendPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = (params?.id as string) || "";

  const now = new Date();
  const minDateISO = localDateISO(now);
  const twoYears = new Date(now);
  twoYears.setFullYear(now.getFullYear() + 2);
  const maxDateISO = localDateISO(twoYears);

  const [all, setAll] = useState<Recipient[]>([]);
  const [already, setAlready] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 表示列設定（フィルター／列に反映）
  const [visible, setVisible] = useState<RecipientColumnKey[]>(DEFAULT_VISIBLE);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/recipient-list-settings", {
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json();
          const cols = (j?.visible_columns ?? []) as RecipientColumnKey[];
          if (Array.isArray(cols) && cols.length) setVisible(cols);
        }
      } catch {
        /* no-op (既定のDEFAULT_VISIBLE) */
      }
    })();
  }, []);

  // フィルター
  const [q, setQ] = useState("");
  const [gender, setGender] = useState("");
  const [pref, setPref] = useState("");
  const [ageMin, setAgeMin] = useState<string>("");
  const [ageMax, setAgeMax] = useState<string>("");
  const [large, setLarge] = useState("");
  const [small, setSmall] = useState("");
  const [companyQ, setCompanyQ] = useState("");

  const smallOptions = useMemo(
    () => (large ? JOB_CATEGORIES[large] ?? [] : []),
    [large]
  );

  const [mode, setMode] = useState<"now" | "reserve">("now");
  const [reserveDate, setReserveDate] = useState<string>(minDateISO);
  const [reserveHour, setReserveHour] = useState<number>(now.getHours());
  const [reserveMinute, setReserveMinute] = useState<number>(
    (Math.ceil(now.getMinutes() / 5) * 5) % 60
  );

  const [msg, setMsg] = useState("");

  const load = async () => {
    const res = await fetch("/api/recipients/search?active=1", {
      cache: "no-store",
    });
    const j = await res.json();
    setAll(j?.rows ?? []);
  };

  const loadAlready = async () => {
    if (!id) return;
    const r = await fetch(`/api/mails/${id}/sent`, { cache: "no-store" });
    const j = await r.json();
    setAlready(new Set<string>(j?.ids ?? []));
  };

  useEffect(() => {
    load();
    loadAlready();
  }, [id]);

  const list = useMemo(() => {
    return all.filter((r) => {
      if (already.has(r.id)) return false;
      if ((visible.includes("name") || visible.includes("email")) && q) {
        const hit = (r.name ?? "").includes(q) || (r.email ?? "").includes(q);
        if (!hit) return false;
      }
      if (visible.includes("gender") && gender && r.gender !== (gender as any))
        return false;
      if (visible.includes("region") && pref && r.region !== pref) return false;
      if (visible.includes("company_name") && companyQ) {
        if (!(r.company_name ?? "").includes(companyQ)) return false;
      }
      if (visible.includes("job_categories")) {
        if (large && r.job_category_large !== large) return false;
        if (small && r.job_category_small !== small) return false;
      }
      if (visible.includes("age")) {
        const age = ageFromBirthday(r.birthday);
        if (ageMin && (age ?? -1) < +ageMin) return false;
        if (ageMax && (age ?? 999) > +ageMax) return false;
      }
      return true;
    });
  }, [
    all,
    already,
    q,
    gender,
    pref,
    companyQ,
    large,
    small,
    ageMin,
    ageMax,
    visible,
  ]);

  const allSelected = list.length > 0 && list.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) {
      list.forEach((r) => next.delete(r.id));
    } else {
      list.forEach((r) => next.add(r.id));
    }
    setSelected(next);
  };

  const toggle = (rid: string) => {
    const next = new Set(selected);
    next.has(rid) ? next.delete(rid) : next.add(rid);
    setSelected(next);
  };

  const onSend = async () => {
    if (!id) {
      alert("メールIDが取得できませんでした");
      return;
    }
    if (selected.size === 0) {
      alert("配信先を1件以上選択してください");
      return;
    }

    const payload: any = {
      mailId: id,
      recipientIds: Array.from(selected),
    };

    if (mode === "reserve") {
      const [yy, mm, dd] = reserveDate.split("-").map((s) => +s);
      const dt = new Date(yy, mm - 1, dd, reserveHour, reserveMinute, 0, 0);
      const min = now;
      const max = new Date(
        twoYears.getFullYear(),
        twoYears.getMonth(),
        twoYears.getDate(),
        23,
        59,
        59
      );
      if (dt < min || dt > max) {
        alert("予約日時は現在時刻以降〜2年後までの範囲で設定してください");
        return;
      }
      payload.scheduleAt = dt.toISOString();
    }

    const res = await fetch("/api/mails/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const t = await res.text();
    setMsg(`${res.status}: ${t}`);

    if (res.ok) {
      toastSuccess(
        mode === "now" ? "送信キューに追加しました" : "予約を作成しました"
      );
      // UX: 送信後は一覧へ戻る
      router.push("/mails");
    } else {
      toastError(`送信/予約に失敗しました（${res.status}）`);
      alert(`送信/予約に失敗しました: ${res.status}\n${t}`);
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* ヘッダー */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-semibold text-neutral-900">
            配信先選択（メール）
          </h1>
          <p className="text-sm text-neutral-500">
            配信先の選択と配信タイミングを設定
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 whitespace-nowrap">
            <input
              type="radio"
              name="mode"
              checked={mode === "now"}
              onChange={() => setMode("now")}
            />
            今すぐ配信
          </label>
          <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 whitespace-nowrap">
            <input
              type="radio"
              name="mode"
              checked={mode === "reserve"}
              onChange={() => setMode("reserve")}
            />
            予約配信
          </label>
        </div>
      </div>

      {mode === "reserve" && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <WheelDatePicker
            label="配信日"
            name="scheduleDate"
            defaultValue={reserveDate}
            minDateISO={minDateISO}
            maxDateISO={maxDateISO}
            onChange={setReserveDate}
          />
          <WheelTimePicker
            label="配信時刻"
            nameHour="scheduleHour"
            nameMinute="scheduleMinute"
            defaultHour={reserveHour}
            defaultMinute={reserveMinute}
            selectedDateISO={reserveDate}
            minForDateISO={minDateISO}
            onChange={(h, m) => {
              setReserveHour(h);
              setReserveMinute(m);
            }}
          />
        </div>
      )}

      {/* フィルター（表示列に追従して表示/非表示） */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(visible.includes("name") || visible.includes("email")) && (
          <input
            placeholder="名前/メールで検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
        )}

        {visible.includes("company_name") && (
          <input
            placeholder="会社名"
            value={companyQ}
            onChange={(e) => setCompanyQ(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
        )}

        {visible.includes("age") && (
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              placeholder="年齢(最小)"
              value={ageMin}
              onChange={(e) => setAgeMin(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
            <input
              type="number"
              inputMode="numeric"
              placeholder="年齢(最大)"
              value={ageMax}
              onChange={(e) => setAgeMax(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </div>
        )}

        {visible.includes("gender") && (
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          >
            <option value="">性別: 指定なし</option>
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
        )}

        {visible.includes("job_categories") && (
          <>
            <select
              value={large}
              onChange={(e) => {
                setLarge(e.target.value);
                setSmall("");
              }}
              className="rounded-lg border border-neutral-300 px-3 py-2"
            >
              <option value="">大カテゴリ: 指定なし</option>
              {JOB_LARGE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={small}
              onChange={(e) => setSmall(e.target.value)}
              disabled={!large}
              className="rounded-lg border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
            >
              <option value="">
                {large ? "小カテゴリ: 指定なし" : "大カテゴリを先に選択"}
              </option>
              {(large ? smallOptions : []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        )}

        {visible.includes("region") && (
          <select
            value={pref}
            onChange={(e) => setPref(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          >
            <option value="">都道府県: 指定なし</option>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* テーブル（表示列に追従） */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left">
                選択
                <div className="mt-1">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                    <span className="text-xs text-neutral-500">
                      表示中を全選択
                    </span>
                  </label>
                </div>
              </th>
              <th className="px-3 py-3 text-left">名前</th>
              {visible.includes("company_name") && (
                <th className="px-3 py-3 text-left">会社名</th>
              )}
              <th className="px-3 py-3 text-left">メール</th>
              {visible.includes("age") && (
                <th className="px-3 py-3 text-center">年齢</th>
              )}
              {visible.includes("gender") && (
                <th className="px-3 py-3 text-center">性別</th>
              )}
              {visible.includes("region") && (
                <th className="px-3 py-3 text-center">都道府県</th>
              )}
              {visible.includes("job_categories") && (
                <th className="px-3 py-3 text-center">職種</th>
              )}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const jobs = normalizeJobs(r);
              return (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-3 py-3">{r.name ?? ""}</td>
                  {visible.includes("company_name") && (
                    <td className="px-3 py-3 text-neutral-700">
                      {r.company_name ?? ""}
                    </td>
                  )}
                  <td className="px-3 py-3 text-neutral-600 whitespace-nowrap">
                    {r.email ?? ""}
                  </td>
                  {visible.includes("age") && (
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {ageFromBirthday(r.birthday) ?? ""}
                    </td>
                  )}
                  {visible.includes("gender") && (
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {r.gender === "male"
                        ? "男性"
                        : r.gender === "female"
                        ? "女性"
                        : ""}
                    </td>
                  )}
                  {visible.includes("region") && (
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {r.region ?? ""}
                    </td>
                  )}
                  {visible.includes("job_categories") && (
                    <td className="px-3 py-3 text-center text-neutral-600">
                      {jobs.length
                        ? jobs.map((s, i) => <div key={i}>{s}</div>)
                        : ""}
                    </td>
                  )}
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td
                  colSpan={
                    2 +
                    (visible.includes("company_name") ? 1 : 0) +
                    (visible.includes("age") ? 1 : 0) +
                    (visible.includes("gender") ? 1 : 0) +
                    (visible.includes("region") ? 1 : 0) +
                    (visible.includes("job_categories") ? 1 : 0)
                  }
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  該当データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 送信ボタン：スマホは幅いっぱい */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={onSend}
          className="w-full rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50 sm:w-auto"
        >
          {mode === "now" ? "今すぐ配信" : "予約を確定"}
        </button>
      </div>

      <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
    </main>
  );
}
