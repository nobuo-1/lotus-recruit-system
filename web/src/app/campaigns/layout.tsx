import AppHeader from "@/components/AppHeader";

export default function CampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // /campaigns 配下（一覧・新規作成など）の全ページにロゴ＋戻るボタンを表示
  return (
    <>
      <AppHeader showBack />
      {children}
    </>
  );
}
