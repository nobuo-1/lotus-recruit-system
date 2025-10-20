// web/src/components/EmailFeatureMenu.tsx
"use client";

import Link from "next/link";
import { Mail, Megaphone, ListChecks } from "lucide-react";

const H = ({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="mb-2 flex items-center gap-2">
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
      {icon}
    </span>
    <h3 className="text-lg md:text-xl font-semibold text-neutral-900">
      {children}
    </h3>
  </div>
);

const Item = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <Link
    href={href}
    className="block rounded-lg px-2 py-1.5 text-base md:text-lg font-medium text-neutral-800 hover:text-neutral-900 hover:bg-neutral-50"
  >
    {children}
  </Link>
);

export default function EmailFeatureMenu() {
  return (
    <div className="space-y-6">
      {/* メール */}
      <section>
        <H icon={<Mail className="h-4 w-4" />}>メール</H>
        <div className="pl-8 space-y-1">
          <Item href="/mails/new">新規メール</Item>
          <Item href="/mails">メール一覧</Item>
          <Item href="/mails/schedules">メール予約リスト</Item>
        </div>
      </section>

      {/* キャンペーン */}
      <section>
        <H icon={<Megaphone className="h-4 w-4" />}>キャンペーン</H>
        <div className="pl-8 space-y-1">
          <Item href="/campaigns/new">新規キャンペーン</Item>
          <Item href="/campaigns">キャンペーン一覧</Item>
          <Item href="/email/schedules">予約一覧</Item>
        </div>
      </section>

      {/* 受信者リスト */}
      <section>
        <H icon={<ListChecks className="h-4 w-4" />}>受信者リスト</H>
        <div className="pl-8 space-y-1">
          <Item href="/recipients/new">新規追加</Item>
          <Item href="/recipients">受信者一覧</Item>
        </div>
      </section>
    </div>
  );
}
