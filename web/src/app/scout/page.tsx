import React from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { Bot, Lock, TimerReset, CheckCircle2 } from "lucide-react";

const FLOWS = [
  {
    key: "mynavi",
    label: "マイナビ",
    summary: "ログイン必須。検索URLをもとに候補者抽出 → 送信。",
    steps: [
      "ログイン → セッション確認",
      "検索URLを読み込み条件を反映",
      "候補者一覧の取得と重複除外",
      "スカウト文の差し込み（テンプレート）",
      "送信 → 送信結果の記録",
    ],
  },
  {
    key: "doda",
    label: "doda",
    summary: "スカウト候補を抽出し、送信履歴を記録。",
    steps: [
      "ログイン → 2段階認証対応",
      "検索条件の読み込み（職種/勤務地）",
      "候補者の抽出と除外条件の反映",
      "メッセージ適用 → 送信",
      "送信ログの保存",
    ],
  },
  {
    key: "type",
    label: "type",
    summary: "候補者検索 → テンプレート送信を自動化。",
    steps: [
      "ログイン → ダッシュボード遷移",
      "条件読み込み（職種/経験/勤務地）",
      "候補者抽出・除外",
      "メッセージ生成 → 送信",
      "結果の記録とエラー回収",
    ],
  },
  {
    key: "womantype",
    label: "女の転職type",
    summary: "女性向け求人特化のRPAフロー。",
    steps: [
      "ログイン → セッション維持",
      "検索条件の読み込み",
      "候補者の抽出とフィルタ",
      "テンプレート適用 → 送信",
      "送信履歴の保存",
    ],
  },
];

function FlowCard({
  label,
  summary,
  steps,
}: {
  label: string;
  summary: string;
  steps: string[];
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-neutral-900">{label}</div>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-600">
          RPA
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{summary}</p>
      <ol className="mt-3 space-y-1 text-xs text-neutral-700">
        {steps.map((step, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="mt-[2px] inline-flex h-4 w-4 items-center justify-center rounded-full border border-neutral-200 text-[10px] text-neutral-600">
              {idx + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function ScoutAutoSendPage() {
  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              スカウト自動送信
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              各転職サイトのRPAにより、候補者抽出から送信までを自動化します。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/scout/logins"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
            >
              ログイン情報の設定
            </Link>
            <span className="rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-400">
              テンプレート管理（準備中）
            </span>
          </div>
        </div>

        <section className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                <Lock className="h-4 w-4" />
                ログイン情報
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                各サイトのログインID/パスワードを登録してください。
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                <Bot className="h-4 w-4" />
                RPA稼働
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                フローごとの稼働状況は順次表示予定です。
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                <TimerReset className="h-4 w-4" />
                実行スケジュール
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                実行頻度と送信上限を設定する予定です。
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            サイト別フロー設計
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {FLOWS.map((flow) => (
              <FlowCard
                key={flow.key}
                label={flow.label}
                summary={flow.summary}
                steps={flow.steps}
              />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
