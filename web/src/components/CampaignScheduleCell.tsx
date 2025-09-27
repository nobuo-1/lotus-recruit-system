"use client";
import React from "react";
import { useEffect, useState } from "react";

/** /api/email/schedules の返却想定 */
type SRow = {
  id: string;
  campaign_title: string | null; // API実装上、campaignIdが入ってくるケースあり
  campaign_id?: string | null; // 将来の拡張で追加している可能性も考慮
  scheduled_at: string | null; // ISO
  status: string | null;
};

// できるだけネットワークを節約するため、モジュールスコープでキャッシュ
let _cache: SRow[] | null = null;
let _loading: Promise<SRow[]> | null = null;

async function loadSchedules(): Promise<SRow[]> {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = fetch("/api/email/schedules", { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => {
      _cache = Array.isArray(j?.rows) ? j.rows : [];
      return _cache!;
    })
    .catch(() => {
      _cache = [];
      return _cache!;
    })
    .finally(() => {
      _loading = null;
    });
  return _loading;
}

export default function CampaignScheduleCell({
  campaignId,
}: {
  campaignId: string;
}) {
  const [rows, setRows] = useState<SRow[] | null>(null);

  useEffect(() => {
    loadSchedules().then(setRows);
  }, []);

  if (!rows) return <span className="text-neutral-400">—</span>;

  // APIの仕様差異に対応：campaign_id があればそれ、無ければ campaign_title をIDとみなす
  const m = rows.filter(
    (r) =>
      (r.campaign_id && r.campaign_id === campaignId) ||
      (!r.campaign_id && r.campaign_title === campaignId)
  );

  if (m.length === 0) return <span className="text-neutral-400">—</span>;

  const dates = m
    .map((r) => (r.scheduled_at ? new Date(r.scheduled_at) : null))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) return <span className="text-neutral-400">—</span>;

  const first = dates[0];
  const label =
    first.toLocaleDateString() +
    " " +
    first.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      {m.length > 1 && (
        <span
          title={`他 ${m.length - 1} 件`}
          className="inline-block rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] leading-none text-neutral-700"
        >
          +{m.length - 1}
        </span>
      )}
    </span>
  );
}
