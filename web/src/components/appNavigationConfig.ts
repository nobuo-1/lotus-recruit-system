import type { LucideIcon } from "lucide-react";
import {
  BookUser,
  Boxes,
  BriefcaseBusiness,
  ChartSpline,
  FileClock,
  FileCog,
  FilePenLine,
  Files,
  LayoutDashboard,
  ListChecks,
  Mail,
  MailPlus,
  Megaphone,
  MessageSquareText,
  Send,
  Settings2,
  ShieldCheck,
  UserRoundPlus,
  Users,
  Workflow,
} from "lucide-react";

export type AppNavItem = {
  title: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
  children?: AppNavItem[];
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    title: "メール配信",
    href: "/email",
    icon: Mail,
    description: "配信準備、送信、結果確認",
    children: [
      { title: "メール配信トップ", href: "/email", icon: Mail },
      { title: "メール一覧", href: "/mails", icon: Files },
      { title: "新規メール", href: "/mails/new", icon: MailPlus },
      { title: "メール予約一覧", href: "/mails/schedules", icon: FileClock },
      { title: "キャンペーン一覧", href: "/campaigns", icon: Megaphone },
      { title: "新規キャンペーン", href: "/campaigns/new", icon: FilePenLine },
      { title: "キャンペーン予約一覧", href: "/email/schedules", icon: FileClock },
      { title: "受信者一覧", href: "/recipients", icon: Users },
      { title: "受信者を追加", href: "/recipients/new", icon: UserRoundPlus },
      { title: "受信者を取り込む", href: "/recipients/upload", icon: BookUser },
      { title: "メール設定", href: "/email/settings", icon: Settings2 },
    ],
  },
  {
    title: "転職サイトリサーチ",
    href: "/job-boards",
    icon: ChartSpline,
    description: "媒体横断の探索と集計",
    children: [
      { title: "リサーチトップ", href: "/job-boards", icon: ChartSpline },
      { title: "手動実行", href: "/job-boards/manual", icon: Workflow },
      { title: "手動実行履歴", href: "/job-boards/manual/history", icon: FileClock },
      { title: "自動実行履歴", href: "/job-boards/runs", icon: LayoutDashboard },
      { title: "自動実行設定", href: "/job-boards/runs/settings", icon: Settings2 },
      { title: "全履歴", href: "/job-boards/runs/all", icon: FileClock },
      { title: "通知先一覧", href: "/job-boards/settings", icon: FileCog },
      {
        title: "通知先設定を追加",
        href: "/job-boards/settings/new",
        icon: FilePenLine,
      },
      { title: "ログイン設定", href: "/job-boards/logins", icon: ShieldCheck },
      { title: "職種マッピング", href: "/job-boards/mappings", icon: BriefcaseBusiness },
    ],
  },
  {
    title: "フォーム営業",
    href: "/form-outreach",
    icon: MessageSquareText,
    description: "企業抽出、送信、自動化",
    children: [
      { title: "フォーム営業トップ", href: "/form-outreach", icon: MessageSquareText },
      { title: "企業リスト", href: "/form-outreach/companies", icon: Boxes },
      { title: "企業リスト手動取得", href: "/form-outreach/companies/fetch", icon: FilePenLine },
      { title: "フォーム・メール一斉送信", href: "/form-outreach/form-send", icon: Send },
      { title: "テンプレート", href: "/form-outreach/templates", icon: Files },
      { title: "送信元設定", href: "/form-outreach/senders", icon: Send },
      { title: "取得ログ", href: "/form-outreach/schedules", icon: FileClock },
      { title: "自動実行設定", href: "/form-outreach/automation", icon: Workflow },
      { title: "フィルタ設定", href: "/form-outreach/settings/filters", icon: Settings2 },
      { title: "手動対応リスト", href: "/form-outreach/waitlist", icon: ListChecks },
    ],
  },
  {
    title: "スカウト運用",
    href: "/scout",
    icon: Send,
    description: "媒体ログインと運用準備",
    children: [
      { title: "スカウト運用トップ", href: "/scout", icon: Send },
      { title: "ログイン設定", href: "/scout/logins", icon: ShieldCheck },
    ],
  },
];

export const TOP_LEVEL_NAV_PATHS = APP_NAV_ITEMS.map((item) => item.href);
