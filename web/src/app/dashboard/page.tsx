import React from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { Mail, Search, Send, FileText } from "lucide-react";

function CardAction({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-neutral-200 p-4 transition hover:bg-neutral-50"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-neutral-200 p-2 text-neutral-600 group-hover:text-neutral-800">
          <Icon size={18} />
        </div>
        <div>
          <div className="font-medium text-neutral-900">{title}</div>
          <div className="text-sm text-neutral-500">{desc}</div>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">
          ダッシュボード
        </h1>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <CardAction
            href="/email"
            icon={Mail}
            title="メール配信"
            desc="キャンペーン作成・配信、KPIの可視化"
          />
          <CardAction
            href="/job-boards" // まだ未実装でもOK
            icon={Search}
            title="転職サイトリサーチ"
            desc="Doda/Type/女の転職/マイナビの横断検索（予定）"
          />
          <CardAction
            href="/scout" // まだ未実装でもOK
            icon={Send}
            title="スカウト自動送信"
            desc="保存済みスカウト文で送信（予定）"
          />
          <CardAction
            href="/form-outreach" // まだ未実装でもOK
            icon={FileText}
            title="フォーム営業"
            desc="法人サイトの問い合わせフォームへ送信（予定）"
          />
        </div>
      </main>
    </>
  );
}
