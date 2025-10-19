// web/src/app/mails/layout.tsx
import React from "react";
import AppHeader from "@/components/AppHeader";

export default function MailsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // /mails 配下（一覧・新規作成・詳細・送信など）の全ページにロゴ＋戻るボタンを表示
  return (
    <>
      <AppHeader showBack />
      {children}
    </>
  );
}
