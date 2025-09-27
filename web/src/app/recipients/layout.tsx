import React from "react";
import AppHeader from "@/components/AppHeader";

export default function RecipientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // /recipients 配下（一覧・新規追加・編集など）の全ページにロゴ＋戻るボタンを表示
  return (
    <>
      <AppHeader showBack />
      {children}
    </>
  );
}
