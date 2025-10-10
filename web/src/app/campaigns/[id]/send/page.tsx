"use client";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import WheelDatePicker from "@/components/WheelDatePicker";
import WheelTimePicker from "@/components/WheelTimePicker";
import { PREFECTURES } from "@/constants/prefectures";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";

type Recipient = {
  id: string;
  name: string | null;
  email: string | null;
  gender: "male" | "female" | null;
  region: string | null;
  birthday: string | null;
  job_category_large: string | null;
  job_category_small: string | null;
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

function formatJob(large?: string | null, small?: string | null): string {
  const L = (large ?? "").trim();
  const S = (small ?? "").trim();
  if (L && S) return `${L}（${S}）`;
  if (L) return L;
  if (S) return S;
  return "";
}

export default function SendPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = (params?.id as string) || "";

  // いま（ローカル）と2年後
  const now = new Date();
  const minDateISO = localDateISO(now);
  const twoYears = new Date(now);
  twoYears.setFullYear(now.getFullYear() + 2);
  const maxDateISO = localDateISO(twoYears);

  // 候補 & 選択
  const [all, setAll] = useState<Recipient[]>([]);
  const [already, setAlready] = useState<Set<string>>(new Set()); // 既送信(予約含む)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // フィルタ
  const [q, setQ] = useState("");
  const [ageMin, setAgeMin] = useState<string>("");
  const [ageMax, setAgeMax] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [pref, setPref] = useState<string>("");
  const [large, setLarge] = useState<string>("");
  const [small, setSmall] = useState<string>("");

  const smallOptions = useMemo(
    () => (large ? JOB_CATEGORIES[large] ?? [] : []),
    [large]
  );

  // 予約/即時
  const [mode, setMode] = useState<"now" | "reserve">("now");
  const [reserveDate, setReserveDate] = useState<string>(minDateISO);
  const [reserveHour, setReserveHour] = useState<number>(now.getHours());
  const [reserveMinute, setReserveMinute] = useState<number>(
    (Math.ceil(now.getMinutes() / 5) * 5) % 60
  );

  const [msg, setMsg] = useState("");

  // 候補取得（アクティブのみ）
  const load = async () => {
    const res = await fetch("/api/recipients/search?active=1");
    const j = await res.json();
    setAll(j?.rows ?? []);
  };

  // 既送信/予約済みの recipient_id を取得して除外
  const loadAlready = async () => {
    if (!id) return;
    const r = await fetch(`/api/campaigns/${id}/sent`, { cache: "no-store" });
    const j = await r.json();
    setAlready(new Set<string>(j?.ids ?? []));
  };

  useEffect(() => {
    load();
    loadAlready();
  }, [id]);

  // クライアントサイドフィルタ + 既送信除外
  const list = useMemo(() => {
    return all.filter((r) => {
      if (already.has(r.id)) return false;
      if (q && !(r.name ?? "").includes(q)) return false;
      if (gender && r.gender !== gender) return false;
      if (pref && r.region !== pref) return false;
      if (large && r.job_category_large !== large) return false;
      if (small && r.job_category_small !== small) return false;
      const age = ageFromBirthday(r.birthday);
      if (ageMin && (age ?? -1) < +ageMin) return false;
      if (ageMax && (age ?? 999) > +ageMax) return false;
      return true;
    });
  }, [all, already, q, gender, pref, large, small, ageMin, ageMax]);

  // --- 一括選択 ---
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
      alert("キャンペーンIDが取得できませんでした");
      return;
    }
    if (selected.size === 0) {
      alert("配信先を1件以上選択してください");
      return;
    }

    const payload: any = {
      campaignId: id,
      recipientIds: Array.from(selected),
    };

    if (mode === "reserve") {
      const [yy, mm, dd] = reserveDate.split("-").map((s) => +s);
      const dt = new Date(yy, mm - 1, dd, reserveHour, reserveMinute, 0, 0); // ローカル基準
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

    // ★ 送信APIへの POST だけにする（フォールバックPOSTは削除）
    const res = await fetch("/api/campaigns/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const t = await res.text();
    setMsg(`${res.status}: ${t}`);

    if (res.ok) {
      router.push(mode === "now" ? "/campaigns" : "/email/schedules");
    } else {
      alert(`送信/予約に失敗しました: ${res.status}\n${t}`);
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            配信先選択
          </h1>
          <p className="text-sm text-neutral-500">
            配信先の選択と配信タイミングを設定
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "now"}
              onChange={() => setMode("now")}
            />
            今すぐ配信
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2">
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

      {/* フィルター */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <input
          placeholder="名前で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2"
        />
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
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2"
        >
          <option value="">性別: 指定なし</option>
          <option value="male">男性</option>
          <option value="female">女性</option>
        </select>

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
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-[900px] w-full text-sm">
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
              <th className="px-3 py-3 text-left">メール</th>
              <th className="px-3 py-3 text-center">年齢</th>
              <th className="px-3 py-3 text-center">性別</th>
              <th className="px-3 py-3 text-center">都道府県</th>
              <th className="px-3 py-3 text-center">職種</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="px-3 py-3">{r.name ?? ""}</td>
                <td className="px-3 py-3 text-neutral-600">{r.email ?? ""}</td>
                <td className="px-3 py-3 text-center">
                  {ageFromBirthday(r.birthday) ?? ""}
                </td>
                <td className="px-3 py-3 text-center">
                  {r.gender === "male"
                    ? "男性"
                    : r.gender === "female"
                    ? "女性"
                    : ""}
                </td>
                <td className="px-3 py-3 text-center">{r.region ?? ""}</td>
                <td className="px-3 py-3 text-center">
                  {formatJob(r.job_category_large, r.job_category_small)}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  該当データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={onSend}
          className="rounded-xl border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
        >
          {mode === "now" ? "今すぐ配信" : "予約を確定"}
        </button>
      </div>

      <pre className="mt-3 text-xs text-neutral-500">{msg}</pre>
    </main>
  );
}
