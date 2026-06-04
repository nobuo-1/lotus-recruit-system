"use client";

import React, { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { ArrowLeft, PlayCircle, Save } from "lucide-react";

const SITE_OPTIONS = [
  { value: "mynavi", label: "マイナビ" },
  { value: "doda", label: "doda" },
  { value: "type", label: "type" },
  { value: "womantype", label: "女の転職type" },
];

type Settings = {
  enabled: boolean;
  timezone: string;
  run_time: string;
  completion_emails: string[];
  notify_on_success: boolean;
  notify_on_failure: boolean;
  sites: string[];
};

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  timezone: "Asia/Tokyo",
  run_time: "09:00",
  completion_emails: [],
  notify_on_success: true,
  notify_on_failure: true,
  sites: SITE_OPTIONS.map((site) => site.value),
};

export default function JobBoardAutoSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [emailText, setEmailText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/job-boards/auto/settings", {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "設定を取得できませんでした。");
        const next = { ...DEFAULT_SETTINGS, ...(json.settings ?? {}) };
        setSettings(next);
        setEmailText((next.completion_emails ?? []).join("\n"));
      } catch (e: any) {
        setMessage(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSite = (site: string, checked: boolean) => {
    setSettings((prev) => {
      const sites = checked
        ? Array.from(new Set([...prev.sites, site]))
        : prev.sites.filter((value) => value !== site);
      return { ...prev, sites };
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        ...settings,
        completion_emails: emailText
          .split(/[\n,;]/)
          .map((value) => value.trim())
          .filter(Boolean),
      };
      const res = await fetch("/api/job-boards/auto/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "保存に失敗しました。");
      setSettings({ ...DEFAULT_SETTINGS, ...(json.settings ?? payload) });
      setMessage("自動実行設定を保存しました。");
    } catch (e: any) {
      setMessage(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setMessage("自動実行を開始しています。");
    try {
      const res = await fetch("/api/job-boards/auto/run-now", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "実行に失敗しました。");
      setMessage(
        `自動実行が完了しました。保存件数: ${json?.result?.rows ?? 0}件`
      );
    } catch (e: any) {
      setMessage(String(e?.message || e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              自動実行設定
            </h1>
            <p className="text-sm text-neutral-500">
              毎月1日に、職種小分類別・都道府県別の求人件数と求職者数を取得します。
            </p>
          </div>
          <Link
            href="/job-boards/runs"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            <ArrowLeft className="h-4 w-4" />
            履歴へ戻る
          </Link>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  実行スケジュール
                </h2>
                <p className="text-sm text-neutral-500">
                  固定日: 毎月1日。求人件数と求職者数を同じタイミングで取得します。
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => update("enabled", e.target.checked)}
                />
                有効
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-neutral-600">実行時刻</span>
                <input
                  type="time"
                  value={settings.run_time}
                  onChange={(e) => update("run_time", e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-neutral-600">タイムゾーン</span>
                <input
                  value={settings.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">
              取得対象
            </h2>
            <p className="mb-3 text-sm text-neutral-500">
              求人件数は小分類単位、求職者数は媒体の検索仕様に合わせて職種カテゴリ単位で取得し、同じ小分類行へ保存します。
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SITE_OPTIONS.map((site) => (
                <label
                  key={site.value}
                  className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={settings.sites.includes(site.value)}
                    onChange={(e) => toggleSite(site.value, e.target.checked)}
                  />
                  {site.label}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">
              完了メール
            </h2>
            <textarea
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              rows={5}
              placeholder="sample@example.com"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.notify_on_success}
                  onChange={(e) =>
                    update("notify_on_success", e.target.checked)
                  }
                />
                成功時に送信
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.notify_on_failure}
                  onChange={(e) =>
                    update("notify_on_failure", e.target.checked)
                  }
                />
                失敗時に送信
              </label>
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-6 text-sm text-neutral-600">
              {loading ? "読み込み中..." : message}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={runNow}
                disabled={running || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <PlayCircle className="h-4 w-4" />
                {running ? "実行中..." : "今すぐ実行"}
              </button>
              <button
                onClick={save}
                disabled={saving || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
