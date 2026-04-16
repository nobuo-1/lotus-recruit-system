"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import Toggle from "@/components/Toggle";
import { PREFECTURES } from "@/constants/prefectures";
import {
  DataTableCard,
  PageHero,
  PageMain,
  SectionTitle,
  SurfaceCard,
  StatChip,
} from "@/components/PageChrome";
import { Pencil, Trash2 } from "lucide-react";

const SITE_OPTIONS = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
] as const;

const DAY_LABELS: Record<number, string> = {
  0: "日",
  1: "月",
  2: "火",
  3: "水",
  4: "木",
  5: "金",
  6: "土",
};

type DestinationType = "email" | "webhook" | "slack";

type Destination = {
  id: string;
  name: string;
  type: DestinationType;
  value: string;
  enabled: boolean;
  created_at: string;
};

type Rule = {
  id: string;
  name: string;
  email?: string | null;
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

type UnifiedRow =
  | {
      id: string;
      title: string;
      createdAt: string;
      destinations: Destination[];
      acquisition: string;
      schedule: string;
      enabled: boolean;
      editHref: string;
      onDelete: () => void;
      onToggle: (next: boolean) => void;
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

function siteLabel(site: string) {
  return SITE_OPTIONS.find((option) => option.value === site)?.label ?? site;
}

function summarizeCategories(rule: Rule) {
  const large = Array.isArray(rule.large) ? rule.large : [];
  const small = Array.isArray(rule.small) ? rule.small : [];
  const pref = Array.isArray(rule.pref) ? rule.pref : [];
  const isNational = pref.length === 0 || pref.length === PREFECTURES.length;
  if (large.length === 0 && small.length === 0 && isNational) {
    return "全国 / 職種指定なし";
  }

  const smallLabels = small.slice(0, 2).map((value) => {
    if (!value.includes(":::")) return value;
    const [parent, child] = value.split(":::");
    return `${parent} / ${child}`;
  });

  return [
    isNational
      ? "都道府県 全国"
      : `都道府県 ${pref.length}件${
          pref.length <= 3 ? ` (${pref.join(", ")})` : ""
        }`,
    large.length > 0 ? `大分類 ${large.length}件` : null,
    small.length > 0
      ? `小分類 ${small.length}件${smallLabels.length ? ` (${smallLabels.join(", ")})` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" ・ ");
}

function summarizeSites(rule: Rule) {
  if (!Array.isArray(rule.sites) || rule.sites.length === 0) return "サイト未指定";
  return rule.sites.map(siteLabel).join(" / ");
}

function scheduleLabel(rule: Rule) {
  const time = rule.schedule_time || "--:--";
  if (rule.schedule_type === "daily") {
    return `毎日 ${time}`;
  }
  const days = Array.isArray(rule.schedule_days)
    ? rule.schedule_days.map((day) => DAY_LABELS[day] ?? String(day))
    : [];
  return `毎週 ${days.length ? days.join("・") : "曜日未指定"} ${time}`;
}

function destinationTypeLabel(type: string) {
  if (type === "email") return "メール";
  if (type === "webhook") return "Webhook";
  if (type === "slack") return "Slack";
  return type;
}

export default function JobBoardSettingsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("");
    try {
      const headers = getTenantHeaders();
      const ruleRes = await fetch("/api/job-boards/notify-rules", {
        headers,
        cache: "no-store",
      });
      const ruleJson = await ruleRes.json().catch(() => ({}));

      if (!ruleRes.ok) throw new Error(ruleJson?.error || "通知設定の取得に失敗しました");

      setRules(Array.isArray(ruleJson.rows) ? (ruleJson.rows as Rule[]) : []);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const activeRuleCount = useMemo(
    () => rules.filter((rule) => rule.enabled).length,
    [rules]
  );
  const toggleRule = async (id: string, next: boolean) => {
    const res = await fetch("/api/job-boards/notify-rules", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getTenantHeaders(),
      },
      body: JSON.stringify({ id, patch: { enabled: next } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json?.error || "通知設定の更新に失敗しました");
      return;
    }
    void load();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("この通知設定を削除します。よろしいですか？")) return;
    const res = await fetch("/api/job-boards/notify-rules", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...getTenantHeaders(),
      },
      body: JSON.stringify({ id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json?.error || "通知設定の削除に失敗しました");
      return;
    }
    void load();
  };
  const unifiedRows: UnifiedRow[] = (() => {
    return rules
      .map((rule) => ({
      id: rule.id,
      title: rule.name,
      createdAt: rule.created_at,
      destinations: Array.isArray(rule.destinations) ? rule.destinations : [],
      acquisition: `${summarizeSites(rule)}\n${summarizeCategories(rule)}`,
      schedule: scheduleLabel(rule),
      enabled: rule.enabled,
      editHref: `/job-boards/settings/new?rule=${rule.id}`,
      onDelete: () => {
        void deleteRule(rule.id);
      },
      onToggle: (next: boolean) => {
        void toggleRule(rule.id, next);
      },
    }))
      .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  })();

  return (
    <>
      <AppHeader showBack />
      <PageMain className="space-y-6">
        <PageHero
          eyebrow="Research Settings"
          title="通知先一覧"
          description="通知先ごとの取得条件、送信先、送信頻度をひとつの一覧で確認できます。"
          accent="gold"
          actions={[
            {
              href: "/job-boards/settings/new",
              label: "通知先設定を追加",
              variant: "primary",
            },
          ]}
        />

        <SurfaceCard>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatChip label="通知先設定数" value={rules.length} />
            <StatChip label="有効な通知先設定" value={activeRuleCount} />
          </div>
        </SurfaceCard>

        <SurfaceCard className="space-y-4">
          <SectionTitle
            title="通知先一覧"
            description="通知先ごとの取得条件、送信先、送信頻度を一覧で管理します。"
            action={
              <Link
                href="/job-boards/settings/new"
                className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50"
              >
                通知先設定を追加
              </Link>
            }
          />

          <DataTableCard className="overflow-x-auto border border-neutral-200 shadow-none">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3 text-left">通知先</th>
                  <th className="px-3 py-3 text-left">送信先</th>
                  <th className="px-3 py-3 text-left">取得情報</th>
                  <th className="px-3 py-3 text-left">送信頻度</th>
                  <th className="px-3 py-3 text-left">有効</th>
                  <th className="px-3 py-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {unifiedRows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-neutral-900">{row.title}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {new Intl.DateTimeFormat("ja-JP", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        }).format(new Date(row.createdAt))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {row.destinations.length > 0 ? (
                        <div className="space-y-1">
                          {row.destinations.slice(0, 3).map((destination) => (
                            <div key={destination.id} className="text-xs text-neutral-700">
                              {destination.name} / {destinationTypeLabel(destination.type)}
                            </div>
                          ))}
                          {row.destinations.length > 3 && (
                            <div className="text-xs text-neutral-400">
                              他 {row.destinations.length - 3} 件
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400">送信先未設定</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="whitespace-pre-line text-xs text-neutral-700">
                        {row.acquisition}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-neutral-700">{row.schedule}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Toggle
                          checked={row.enabled}
                          onChange={row.onToggle}
                          label={`unified-row-${row.id}`}
                        />
                        <span className="text-xs text-neutral-500">
                          {row.enabled ? "有効" : "停止中"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={row.editHref}
                          title="編集"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 hover:bg-neutral-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          title="削除"
                          onClick={row.onDelete}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {unifiedRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      まだ通知先設定がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DataTableCard>
        </SurfaceCard>

        {msg && (
          <pre className="whitespace-pre-wrap text-xs text-red-600">{msg}</pre>
        )}
      </PageMain>
    </>
  );
}
