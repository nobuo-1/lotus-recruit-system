"use client";
import React, { useState } from "react";

type MailProps = {
  kind: "mail";
  scheduleId: string;
  mailId?: string;
  onDone?: () => void;
};

type CampaignProps = {
  kind: "campaign";
  scheduleId: string;
  campaignId?: string;
  onDone?: () => void;
};

type Props = MailProps | CampaignProps;

export default function ScheduleCancelButton(props: Props) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    if (!confirm("この予約をキャンセルします。よろしいですか？")) return;

    try {
      setLoading(true);

      const url =
        props.kind === "mail"
          ? "/api/mails/schedules/cancel"
          : "/api/campaigns/schedules/cancel";

      // API 互換のため scheduleId を基本に、IDが分かる場合は併送
      const payload: Record<string, any> = { scheduleId: props.scheduleId };
      if (props.kind === "mail" && props.mailId) payload.mailId = props.mailId;
      if (props.kind === "campaign" && props.campaignId)
        payload.campaignId = props.campaignId;

      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) {
        console.error("cancel failed:", res.status, text);
        alert(`キャンセルに失敗しました：${res.status}\n${text}`);
        return;
      }

      if (props.onDone) props.onDone();
      else window.location.reload();
    } catch (e: any) {
      alert(`キャンセルに失敗しました：${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`rounded-xl border px-3 py-1 whitespace-nowrap ${
        loading
          ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
          : "border-neutral-200 hover:bg-neutral-50"
      }`}
      title="この予約をキャンセル"
    >
      {loading ? "キャンセル中…" : "予約をキャンセル"}
    </button>
  );
}
