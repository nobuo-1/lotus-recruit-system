"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Toggle from "@/components/Toggle";
import JobCategoryModal from "@/components/job-boards/JobCategoryModal";
import { PREFECTURES } from "@/constants/prefectures";
import {
  PageHero,
  PageMain,
  SectionTitle,
  SurfaceCard,
} from "@/components/PageChrome";

const SITE_OPTIONS = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
] as const;

const DAY_OPTIONS = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 0, label: "日" },
] as const;

const ALL_PREFECTURES = [...PREFECTURES];

type DestinationType = "email" | "webhook" | "slack";

type Destination = {
  id: string;
  name: string;
  type: DestinationType;
  value: string;
  enabled: boolean;
  created_at: string;
};

type Recipient = {
  id: string;
  name: string | null;
  company_name?: string | null;
  email: string | null;
  is_active?: boolean | null;
};

type Rule = {
  id: string;
  name: string;
  sites: string[];
  pref?: string[] | null;
  large?: string[] | null;
  small?: string[] | null;
  enabled: boolean;
  schedule_type: string;
  schedule_time: string | null;
  schedule_days?: number[] | null;
  timezone?: string | null;
  destination_ids?: string[];
  destinations?: Destination[];
  created_at: string;
};

type DestinationDraft = {
  name: string;
  type: DestinationType;
  value: string;
  enabled: boolean;
};

type DirectDestinationDraft = {
  id?: string;
  key: string;
  type: DestinationType;
  value: string;
};

function getTenantHeaders(): Record<string, string> {
  try {
    const match = document.cookie.match(
      /(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i
    );
    if (!match) return {};
    return { "x-tenant-id": decodeURIComponent(match[2]) };
  } catch {
    return {};
  }
}

function summarizeSelectedCategories(large: string[], small: string[]) {
  if (large.length === 0 && small.length === 0) return "職種指定なし";
  const preview = small.slice(0, 3).map((value) => {
    if (!value.includes(":::")) return value;
    const [parent, child] = value.split(":::");
    return `${parent} / ${child}`;
  });
  return [
    large.length > 0 ? `大分類 ${large.length}件` : null,
    small.length > 0
      ? `小分類 ${small.length}件${preview.length ? ` (${preview.join(", ")})` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" ・ ");
}

function buildDestinationPayload(draft: DestinationDraft) {
  return {
    name: draft.name.trim(),
    type: draft.type,
    value: draft.value.trim(),
    enabled: draft.enabled,
  };
}

function normalizeDestinationValue(type: DestinationType, value: string) {
  const trimmed = value.trim();
  return type === "email" ? trimmed.toLowerCase() : trimmed;
}

function buildGeneratedDestinationName(type: DestinationType, value: string) {
  const trimmed = value.trim();
  if (type === "email") return trimmed;
  if (type === "slack") return `Slack: ${trimmed}`;
  return `Webhook: ${trimmed.replace(/^https?:\/\//, "")}`;
}

function createDirectDestinationDraft(
  type: DestinationType = "email",
  value = "",
  id?: string
): DirectDestinationDraft {
  return {
    id,
    key: `${Date.now()}-${Math.random()}`,
    type,
    value,
  };
}

function recipientLabel(recipient: Recipient) {
  const parts = [recipient.name, recipient.company_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : recipient.email || "名称未設定";
}

function summarizeSelectedPrefectures(pref: string[]) {
  if (pref.length === 0 || pref.length === ALL_PREFECTURES.length) return "全国";
  if (pref.length <= 4) return pref.join(" / ");
  return `${pref.slice(0, 4).join(" / ")} ほか${pref.length - 4}件`;
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium text-neutral-800">{label}</div>
        {description && <p className="mt-1 text-xs text-neutral-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SegmentedButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}

function PrefectureSelector({
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  selected: string[];
  onToggle: (prefecture: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const isNational = selected.length === ALL_PREFECTURES.length;

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={isNational ? onClear : onSelectAll}
          className="rounded-full border border-neutral-300 px-3 py-2 text-sm hover:bg-white"
        >
          {isNational ? "すべてを解除" : "すべてを選択"}
        </button>
        <div className="text-xs text-neutral-500">
          {selected.length > 0
            ? `${selected.length}件選択中: ${summarizeSelectedPrefectures(selected)}`
            : "全国を解除した場合は、対象の都道府県を選択してください"}
        </div>
      </div>

      <div className="grid max-h-[280px] grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3 md:grid-cols-3 lg:grid-cols-4">
        {PREFECTURES.map((prefecture) => {
          const active = selected.includes(prefecture);
          return (
            <button
              key={prefecture}
              type="button"
              onClick={() => onToggle(prefecture)}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                active
                  ? "border-neutral-900 bg-neutral-950 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {prefecture}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SettingsFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ruleId = searchParams.get("rule");

  const [rules, setRules] = useState<Rule[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [openCat, setOpenCat] = useState(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [recipientQuery, setRecipientQuery] = useState("");

  const [name, setName] = useState("");
  const [sites, setSites] = useState<string[]>(SITE_OPTIONS.map((site) => site.value));
  const [pref, setPref] = useState<string[]>([]);
  const [large, setLarge] = useState<string[]>([]);
  const [small, setSmall] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [scheduleType, setScheduleType] = useState<"daily" | "weekly">("weekly");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleDays, setScheduleDays] = useState<number[]>([1]);
  const [timezone, setTimezone] = useState("Asia/Tokyo");
  const [directDestinations, setDirectDestinations] = useState<DirectDestinationDraft[]>([
    createDirectDestinationDraft(),
  ]);

  const filteredRecipients = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase();
    const rows = recipients.filter((recipient) => !!recipient.email);
    if (!q) return rows;
    return rows.filter((recipient) =>
      [recipient.name, recipient.company_name, recipient.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [recipientQuery, recipients]);

  const load = async () => {
    setLoading(true);
    setMsg("");
    try {
      const headers = getTenantHeaders();
      const [ruleRes, destinationRes, recipientRes] = await Promise.all([
        fetch("/api/job-boards/notify-rules", { headers, cache: "no-store" }),
        fetch("/api/job-boards/destinations", { headers, cache: "no-store" }),
        fetch("/api/recipients/search?active=1", { cache: "no-store" }),
      ]);
      const [ruleJson, destinationJson, recipientJson] = await Promise.all([
        ruleRes.json().catch(() => ({})),
        destinationRes.json().catch(() => ({})),
        recipientRes.json().catch(() => ({})),
      ]);

      if (!ruleRes.ok) throw new Error(ruleJson?.error || "通知設定の取得に失敗しました");
      if (!destinationRes.ok) {
        throw new Error(destinationJson?.error || "送り先の取得に失敗しました");
      }
      if (!recipientRes.ok) {
        throw new Error(recipientJson?.error || "受信者リストの取得に失敗しました");
      }

      setRules(Array.isArray(ruleJson.rows) ? (ruleJson.rows as Rule[]) : []);
      setDestinations(
        Array.isArray(destinationJson.rows)
          ? (destinationJson.rows as Destination[])
          : []
      );
      setRecipients(
        Array.isArray(recipientJson.rows) ? (recipientJson.rows as Recipient[]) : []
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetRuleForm = () => {
    setName("");
    setSites(SITE_OPTIONS.map((site) => site.value));
    setPref([...ALL_PREFECTURES]);
    setLarge([]);
    setSmall([]);
    setEnabled(true);
    setScheduleType("weekly");
    setScheduleTime("09:00");
    setScheduleDays([1]);
    setTimezone("Asia/Tokyo");
  };

  const resetDestinationTargets = () => {
    setSelectedRecipientIds([]);
    setRecipientQuery("");
    setDirectDestinations([createDirectDestinationDraft()]);
  };

  const applyRuleForm = (rule: Rule) => {
    setName(rule.name || "");
    setSites(Array.isArray(rule.sites) ? rule.sites : []);
    const nextPref = Array.isArray(rule.pref) ? rule.pref : [];
    setPref(nextPref.length > 0 ? nextPref : [...ALL_PREFECTURES]);
    setLarge(Array.isArray(rule.large) ? rule.large : []);
    setSmall(Array.isArray(rule.small) ? rule.small : []);
    setEnabled(!!rule.enabled);
    setScheduleType(rule.schedule_type === "daily" ? "daily" : "weekly");
    setScheduleTime(rule.schedule_time || "09:00");
    setScheduleDays(
      Array.isArray(rule.schedule_days) && rule.schedule_days.length > 0
        ? rule.schedule_days
        : [1]
    );
    setTimezone(rule.timezone || "Asia/Tokyo");
  };

  useEffect(() => {
    if (!ruleId) {
      resetRuleForm();
      resetDestinationTargets();
      return;
    }

    const linkedRule = rules.find((item) => item.id === ruleId);
    if (linkedRule) {
      applyRuleForm(linkedRule);
      const linkedDestinations = Array.isArray(linkedRule.destinations)
        ? linkedRule.destinations
        : [];
      const nextRecipientIds: string[] = [];
      const nextDirectDestinations: DirectDestinationDraft[] = [];

      for (const destination of linkedDestinations) {
        const matchedRecipient =
          destination.type === "email"
            ? recipients.find(
                (recipient) =>
                  !!recipient.email &&
                  normalizeDestinationValue("email", recipient.email) ===
                    normalizeDestinationValue("email", destination.value)
              )
            : null;

        if (matchedRecipient?.id) {
          nextRecipientIds.push(matchedRecipient.id);
          continue;
        }

        nextDirectDestinations.push(
          createDirectDestinationDraft(
            destination.type,
            destination.value,
            destination.id
          )
        );
      }

      setSelectedRecipientIds(Array.from(new Set(nextRecipientIds)));
      setDirectDestinations(
        nextDirectDestinations.length > 0
          ? nextDirectDestinations
          : [createDirectDestinationDraft()]
      );
    }
  }, [
    ruleId,
    rules,
    recipients,
  ]);

  const toggleSite = (site: string) => {
    setSites((current) =>
      current.includes(site)
        ? current.filter((value) => value !== site)
        : [...current, site]
    );
  };

  const togglePrefecture = (prefecture: string) => {
    setPref((current) =>
      current.includes(prefecture)
        ? current.filter((value) => value !== prefecture)
        : [...current, prefecture]
    );
  };

  const toggleScheduleDay = (day: number) => {
    setScheduleDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day]
    );
  };

  const toggleRecipientSelection = (recipientId: string) => {
    setSelectedRecipientIds((current) =>
      current.includes(recipientId)
        ? current.filter((value) => value !== recipientId)
        : [...current, recipientId]
    );
  };

  const updateDirectDestination = (
    key: string,
    patch: Partial<DirectDestinationDraft>
  ) => {
    setDirectDestinations((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const addDirectDestination = () => {
    setDirectDestinations((current) => [...current, createDirectDestinationDraft()]);
  };

  const removeDirectDestination = (key: string) => {
    setDirectDestinations((current) => {
      const next = current.filter((item) => item.key !== key);
      return next.length > 0 ? next : [createDirectDestinationDraft()];
    });
  };

  const buildRulePayload = (destinationIds: string[]) => ({
    name: name.trim(),
    sites,
    pref,
    large,
    small,
    enabled,
    schedule_type: scheduleType,
    schedule_time: scheduleTime,
    schedule_days: scheduleType === "weekly" ? scheduleDays : null,
    timezone,
    destination_ids: destinationIds,
  });

  const saveDestination = async (draft: DestinationDraft, id?: string | null) => {
    const payload = buildDestinationPayload(draft);
    if (!payload.name || !payload.value) {
      throw new Error("送り先名と送り先情報は必須です");
    }

    const res = await fetch("/api/job-boards/destinations", {
      method: id ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...getTenantHeaders(),
      },
      body: JSON.stringify(id ? { id, patch: payload } : payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || "送り先の保存に失敗しました");
    }
    return (json?.row ?? null) as Destination | null;
  };

  const resolveDestinationIdsFromForm = async () => {
    const recipientSpecs = recipients
      .filter(
        (recipient) =>
          selectedRecipientIds.includes(recipient.id) && !!recipient.email?.trim()
      )
      .map((recipient) => ({
        type: "email" as const,
        value: recipient.email!.trim(),
        name: recipientLabel(recipient),
      }));

    const directSpecs = directDestinations
      .map((destination) => ({
        id: destination.id,
        type: destination.type,
        value: destination.value.trim(),
        name: buildGeneratedDestinationName(destination.type, destination.value),
      }))
      .filter((destination) => !!destination.value);

    const deduped = new Map<
      string,
      { id?: string; type: DestinationType; value: string; name: string }
    >();

    for (const destination of [...recipientSpecs, ...directSpecs]) {
      const key = `${destination.type}:${normalizeDestinationValue(
        destination.type,
        destination.value
      )}`;
      if (!deduped.has(key)) deduped.set(key, destination);
    }

    const items = [...deduped.values()];
    if (items.length === 0) {
      throw new Error("送信先を1つ以上設定してください");
    }

    const ids: string[] = [];

    for (const item of items) {
      const existing = item.id
        ? destinations.find((destination) => destination.id === item.id)
        : destinations.find(
            (destination) =>
              destination.type === item.type &&
              normalizeDestinationValue(destination.type, destination.value) ===
                normalizeDestinationValue(item.type, item.value)
          );

      if (existing?.id) {
        const shouldUpdate =
          existing.name !== item.name ||
          existing.type !== item.type ||
          existing.value !== item.value ||
          !existing.enabled;

        if (shouldUpdate) {
          const updated = await saveDestination(
            {
              name: item.name,
              type: item.type,
              value: item.value,
              enabled: true,
            },
            existing.id
          );
          ids.push(updated?.id ?? existing.id);
        } else {
          ids.push(existing.id);
        }
        continue;
      }

      const created = await saveDestination({
        name: item.name,
        type: item.type,
        value: item.value,
        enabled: true,
      });
      if (created?.id) ids.push(created.id);
    }

    return Array.from(new Set(ids));
  };

  const saveDestinationMode = async () => {
    if (!name.trim()) {
      setMsg("設定名は必須です");
      return;
    }
    if (sites.length === 0) {
      setMsg("対象サイトを1つ以上選択してください");
      return;
    }
    if (pref.length === 0) {
      setMsg("都道府県を1つ以上選択するか、全国を選択してください");
      return;
    }
    if (scheduleType === "weekly" && scheduleDays.length === 0) {
      setMsg("週次配信では曜日を1つ以上選択してください");
      return;
    }

    setSaving(true);
    setMsg("");
    try {
      const destinationIdsForRule = await resolveDestinationIdsFromForm();
      const linkedRule = ruleId ? rules.find((rule) => rule.id === ruleId) : null;
      const rulePayload = buildRulePayload(destinationIdsForRule);
      const res = await fetch("/api/job-boards/notify-rules", {
        method: linkedRule ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...getTenantHeaders(),
        },
        body: JSON.stringify(
          linkedRule ? { id: linkedRule.id, ...rulePayload } : rulePayload
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "通知設定の保存に失敗しました");
      }
      router.push("/job-boards/settings");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const isEditingNotificationSetting = !!ruleId;
  const title = isEditingNotificationSetting ? "通知先設定を編集" : "通知先設定を追加";
  const description =
    "通知先ごとに、取得対象、送信頻度、送信先をひとつのフォームでまとめて登録します。";

  return (
    <>
      <PageHero
        eyebrow="Research Setup"
        title={title}
        description={description}
        accent="gold"
        actions={[
          { href: "/job-boards/settings", label: "一覧へ戻る", variant: "secondary" },
        ]}
      />

      <SurfaceCard className="space-y-5">
        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
            読み込み中…
          </div>
        ) : (
          <div className="space-y-6">
            <SectionTitle
              title="通知先設定"
              description="通知設定と送り先を通知先単位でまとめて管理します。"
            />

            <Field label="設定名" description="一覧に表示する管理用の名前です。">
              <input
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例）営業責任者向け日次通知"
              />
            </Field>

            <Field
              label="通知先に使う受信者"
              description="受信者リストから複数の送信先を選択できます。"
            >
              <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <input
                  className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                  value={recipientQuery}
                  onChange={(e) => setRecipientQuery(e.target.value)}
                  placeholder="氏名、会社名、メールアドレスで検索"
                />

                <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3">
                  {filteredRecipients.length > 0 ? (
                    filteredRecipients.map((recipient) => (
                      <label
                        key={recipient.id}
                        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-200 px-4 py-3 hover:bg-neutral-50"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedRecipientIds.includes(recipient.id)}
                          onChange={() => toggleRecipientSelection(recipient.id)}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-neutral-900">
                            {recipientLabel(recipient)}
                          </div>
                          <div className="mt-1 break-all text-xs text-neutral-500">
                            {recipient.email}
                          </div>
                        </div>
                      </label>
                    ))
                  ) : (
                    <div className="px-3 py-8 text-center text-sm text-neutral-400">
                      該当する受信者がありません
                    </div>
                  )}
                </div>

                <div className="text-xs text-neutral-500">
                  {selectedRecipientIds.length > 0
                    ? `${selectedRecipientIds.length}件の受信者を選択中`
                    : "まだ受信者は選択されていません"}
                </div>
              </div>
            </Field>

            <Field
              label="送り先情報"
              description="直接入力の送信先を複数追加できます。"
            >
              <div className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                {directDestinations.map((destination, index) => (
                  <div
                    key={destination.key}
                    className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 md:grid-cols-[180px_minmax(0,1fr)_120px]"
                  >
                    <select
                      value={destination.type}
                      onChange={(e) =>
                        updateDirectDestination(destination.key, {
                          type: e.target.value as DestinationType,
                        })
                      }
                      className="rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                    >
                      <option value="email">メール</option>
                      <option value="webhook">Webhook</option>
                      <option value="slack">Slack</option>
                    </select>
                    <input
                      className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                      value={destination.value}
                      onChange={(e) =>
                        updateDirectDestination(destination.key, {
                          value: e.target.value,
                        })
                      }
                      placeholder={
                        destination.type === "email"
                          ? "例）alerts@example.com"
                          : destination.type === "webhook"
                            ? "例）https://example.com/webhook"
                            : "例）#alerts または Slack Webhook URL"
                      }
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => removeDirectDestination(destination.key)}
                        className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm hover:bg-neutral-50"
                      >
                        {directDestinations.length === 1 && index === 0
                          ? "クリア"
                          : "削除"}
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addDirectDestination}
                  className="rounded-2xl border border-neutral-300 px-4 py-3 text-sm hover:bg-white"
                >
                  送り先を追加
                </button>
              </div>
            </Field>

            <Field label="取得対象サイト">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSites(SITE_OPTIONS.map((site) => site.value))}
                  className="rounded-full border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  すべて選択
                </button>
                <button
                  type="button"
                  onClick={() => setSites([])}
                  className="rounded-full border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  解除
                </button>
                {SITE_OPTIONS.map((site) => (
                  <SegmentedButton
                    key={site.value}
                    active={sites.includes(site.value)}
                    onClick={() => toggleSite(site.value)}
                  >
                    {site.label}
                  </SegmentedButton>
                ))}
              </div>
            </Field>

            <Field
              label="取得する都道府県"
              description="指定なしでは登録できません。すべて選択した場合は全国として扱います。"
            >
              <PrefectureSelector
                selected={pref}
                onToggle={togglePrefecture}
                onSelectAll={() => setPref([...ALL_PREFECTURES])}
                onClear={() => setPref([])}
              />
            </Field>

            <Field
              label="取得職種"
              description="年齢層・雇用形態・年収帯は登録対象から外し、職種だけを扱います。"
            >
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOpenCat(true)}
                  className="rounded-2xl border border-neutral-300 px-4 py-3 text-sm hover:bg-neutral-50"
                >
                  職種を選択
                </button>
                <div className="text-sm text-neutral-600">
                  {summarizeSelectedCategories(large, small)}
                </div>
              </div>
            </Field>

            <Field label="送信頻度" description="通知の配信タイミングを設定します。">
              <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex flex-wrap gap-2">
                  <SegmentedButton
                    active={scheduleType === "weekly"}
                    onClick={() => setScheduleType("weekly")}
                  >
                    毎週
                  </SegmentedButton>
                  <SegmentedButton
                    active={scheduleType === "daily"}
                    onClick={() => setScheduleType("daily")}
                  >
                    毎日
                  </SegmentedButton>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="mb-2 text-xs text-neutral-500">配信時刻</div>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-xs text-neutral-500">タイムゾーン</div>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                    >
                      <option value="Asia/Tokyo">Asia/Tokyo</option>
                    </select>
                  </div>
                  <div>
                    <div className="mb-2 text-xs text-neutral-500">通知設定の有効状態</div>
                    <div className="flex items-center gap-3 rounded-2xl border border-neutral-300 bg-white px-4 py-3">
                      <Toggle
                        checked={enabled}
                        onChange={setEnabled}
                        label="notify-rule-enabled-destination-mode"
                      />
                      <span className="text-sm text-neutral-600">
                        {enabled ? "有効" : "停止中"}
                      </span>
                    </div>
                  </div>
                </div>

                {scheduleType === "weekly" && (
                  <div>
                    <div className="mb-2 text-xs text-neutral-500">配信曜日</div>
                    <div className="flex flex-wrap gap-2">
                      {DAY_OPTIONS.map((day) => (
                        <SegmentedButton
                          key={day.value}
                          active={scheduleDays.includes(day.value)}
                          onClick={() => toggleScheduleDay(day.value)}
                        >
                          {day.label}
                        </SegmentedButton>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveDestinationMode}
                disabled={saving}
                className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? "保存中…" : isEditingNotificationSetting ? "更新する" : "登録する"}
              </button>
              <Link
                href="/job-boards/settings"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-sm hover:bg-neutral-50"
              >
                キャンセル
              </Link>
            </div>
          </div>
        )}

        {msg && (
          <pre className="whitespace-pre-wrap rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {msg}
          </pre>
        )}
      </SurfaceCard>

      {openCat && (
        <JobCategoryModal
          large={large}
          small={small}
          onCloseAction={() => setOpenCat(false)}
          onApplyAction={(nextLarge: string[], nextSmall: string[]) => {
            setLarge(nextLarge);
            setSmall(nextSmall);
            setOpenCat(false);
          }}
        />
      )}
    </>
  );
}

export default function JobBoardSettingsNewPage() {
  return (
    <>
      <AppHeader showBack />
      <PageMain className="space-y-6">
        <Suspense
          fallback={
            <SurfaceCard>
              <div className="py-12 text-center text-sm text-neutral-500">
                読み込み中…
              </div>
            </SurfaceCard>
          }
        >
          <SettingsFormContent />
        </Suspense>
      </PageMain>
    </>
  );
}
