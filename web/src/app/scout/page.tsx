import React from "react";
import AppHeader from "@/components/AppHeader";
import {
  ActionGrid,
  PageHero,
  PageMain,
  SectionTitle,
  SurfaceCard,
  StatChip,
} from "@/components/PageChrome";
import {
  Bot,
  CheckCircle2,
  Lock,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

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
      "ログイン → 作業画面へ遷移",
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
    <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,252,0.94))] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-base font-semibold text-neutral-950">{label}</div>
        <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          RPA
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{summary}</p>
      <ol className="mt-4 space-y-2 text-sm text-neutral-700">
        {steps.map((step, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="mt-[2px] inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-200 bg-white text-[10px] font-semibold text-neutral-600">
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
      <AppHeader />
      <PageMain className="space-y-6">
        <PageHero
          eyebrow="Scout Operations"
          title="スカウト送信の準備と自動化設計を一画面で把握"
          description="媒体ごとのログインやフロー差分を整理しながら、自動送信の前提条件を明確にします。設定不足の洗い出しがしやすい情報配置に変更しました。"
          accent="rose"
          actions={[
            { href: "/scout/logins", label: "ログイン情報を設定", variant: "primary" },
          ]}
        />

        <SurfaceCard>
          <SectionTitle
            title="準備状況"
            description="自動送信フローの着手前に見ておきたい項目です。"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatChip label="対応サイト" value={FLOWS.length} />
            <StatChip label="ログイン設定" value="必須" />
            <StatChip label="自動化ステータス" value="設計中" />
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle
            title="クイック操作"
            description="スカウト運用の入口をまとめています。"
          />
          <ActionGrid
            columns="two"
            items={[
              {
                href: "/scout/logins",
                title: "ログイン情報の設定",
                description: "クライアント単位で媒体ログイン情報を管理します。",
                icon: ShieldCheck,
              },
              {
                href: "/scout/logins",
                title: "媒体ごとの接続確認",
                description: "送信前に認証情報の最新状態を見直します。",
                icon: Lock,
              },
            ]}
          />
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle
            title="運用前チェック"
            description="自動化を安定運用するための前提条件です。"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
                <Lock className="h-4 w-4" />
                ログイン情報
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                各サイトのID、パスワード、補足情報を媒体ごとに保持します。
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
                <Bot className="h-4 w-4" />
                RPA稼働
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                フローごとの状態、失敗点、再試行対象を順次可視化する前提です。
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
                <TimerReset className="h-4 w-4" />
                実行スケジュール
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                実行頻度、送信上限、媒体ごとの制約を後から調整しやすくします。
              </p>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle
            title="サイト別フロー設計"
            description="媒体ごとの違いを崩さず、工程を読みやすく整理しました。"
            action={
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                設計レビュー向け
              </div>
            }
          />
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
        </SurfaceCard>
      </PageMain>
    </>
  );
}
